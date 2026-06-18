import { create } from 'zustand';
import { api } from '../lib/axios';
import { auth } from '../lib/firebase';
import { useSocketStore } from './useSocketStore';
import { useChatStore } from './useChatStore';
import { useAuthStore } from './useAuthStore';
import { sameId } from '../lib/conversation';
import {
  importPrivateKey,
  importPublicKey,
  deriveSharedSecret,
  encryptText,
  decryptText,
  importSymmetricKey
} from '../lib/crypto';
import { deriveConversationKey } from '../lib/mediaKeys';
import { cacheMessage, cacheMessages, getCachedMessages, clearCachedMessages, deleteCachedMessage, getPendingMessages } from '../lib/db';

let messageHandler = null;
let readReceiptHandler = null;

// ⚡ THE STRICT DECRYPTER — single source of truth for turning a stored `msg`
// into displayable text. Returns a STRING, never raw ciphertext JSON.
//   • Plaintext (JSON.parse throws SyntaxError)      → original text
//   • JSON without crypto headers                    → original text
//   • Guaranteed ciphertext + missing shared secret  → "Awaiting Key Sync" banner
//   • Guaranteed ciphertext + decrypt math fails     → "Mathematical Mismatch" banner
const safeDecryptMessage = async (msg, sharedSecret) => {
    if (!msg || !msg.text) return "";
    try {
        // If it's standard plaintext, JSON.parse will fail and jump to the catch block
        const parsed = JSON.parse(msg.text);

        // If it is JSON but lacks crypto headers, it's normal text
        if (!parsed.iv || !parsed.ciphertext) return msg.text;

        // 🚨 IF WE REACH HERE, IT IS GUARANTEED CIPHER-TEXT.
        if (!sharedSecret) {
            console.error("🔴 E2E Blocked: Shared Secret is missing. Message:", msg._id);
            return "🔒 [Encrypted Message - Awaiting Key Sync]";
        }

        const decryptedText = await decryptText(parsed, sharedSecret);

        // decryptText() swallows its own errors and returns a sentinel string —
        // treat that as a hard math failure rather than rendering the sentinel.
        if (!decryptedText || decryptedText === "[Encrypted Message - Unreadable]") {
            console.error("🔴 E2E Math Failed: decryptText returned sentinel. Message:", msg._id);
            return "🔒 [Encrypted Message - Mathematical Mismatch]";
        }

        return decryptedText;
    } catch (e) {
        if (e.name === "SyntaxError") return msg.text; // Safe Plaintext fallback
        console.error("🔴 E2E Math Failed for msg:", msg._id, "Raw Error:", e);
        return "🔒 [Encrypted Message - Mathematical Mismatch]";
    }
};

// ⚡ VECTOR 2: Unwrap the group's AES symmetric key for the current user.
// Finds our personal wrapped-key entry, unwraps it using ECDH(myPrivate, creatorPublic),
// and re-imports it as an AES-GCM CryptoKey. Returns null for legacy/plaintext groups
// or when keys are unavailable (caller then falls back to plaintext).
const deriveGroupKey = async (conversation, currentUser) => {
  if (!conversation?.isGroup) return null;

  const groupKeys = conversation.encryptedGroupKeys;
  if (!Array.isArray(groupKeys) || groupKeys.length === 0) return null; // legacy group

  const myEntry = groupKeys.find((k) => sameId(k.userId, currentUser?._id));
  if (!myEntry?.encryptedKeyPayload) return null;

  // The wrapping secret was ECDH(creatorPrivate, memberPublic); by ECDH symmetry
  // we reconstruct it here as ECDH(myPrivate, creatorPublic).
  const creatorId = conversation.groupAdmins?.[0];
  const creator = conversation.participants?.find((p) => sameId(p._id, creatorId));
  const privateKeyJwk = localStorage.getItem("zync_private_key");

  if (!creator?.publicKey || !privateKeyJwk) return null;

  try {
    const myPriv = await importPrivateKey(privateKeyJwk);
    const creatorPub = await importPublicKey(creator.publicKey);
    const wrapSecret = await deriveSharedSecret(myPriv, creatorPub);

    const parsedPayload = JSON.parse(myEntry.encryptedKeyPayload);
    const rawGroupKeyStr = await decryptText(parsedPayload, wrapSecret);
    if (!rawGroupKeyStr || rawGroupKeyStr === "[Encrypted Message - Unreadable]") return null;

    return await importSymmetricKey(rawGroupKeyStr);
  } catch (err) {
    console.error("Failed to derive group symmetric key:", err);
    return null;
  }
};

// ⚡ Shared decrypt-map helper (identical semantics to the 1-on-1 path):
// decrypts any {iv, ciphertext} payloads in a message list using the given key,
// leaving non-encrypted / unparseable messages untouched.
const decryptMessagesWith = async (messages, key) => {
  return Promise.all(
    messages.map(async (msg) => ({ ...msg, text: await safeDecryptMessage(msg, key) }))
  );
};

export const useMessageStore = create((set, get) => ({
  messages: [],
  isFetching: false,
  typingConversations: {},

  setTypingState: (conversationId, isTyping) => {
    set((state) => ({
      typingConversations: {
        ...state.typingConversations,
        [conversationId]: isTyping,
      },
    }));
  },

  // ⚡ "Clear All Chats" — hard-purges the user's message history server-side,
  // then empties the in-memory feed. 🔒 IDENTITY-SAFE: this never touches the
  // E2E decryption pipeline or the local `zync_private_key`; only message
  // documents and the rendered list are cleared.
  clearAllMessages: async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('No active session token found');

      await api.delete('/messages/clear', {
        headers: { Authorization: `Bearer ${token}` },
      });

      // ⚡ PHASE 3 — WIPE PROTOCOL: nuke the local IndexedDB cache alongside the
      // server-side purge and the in-memory feed reset, so no decrypted history
      // lingers on the device after a "Clear All Chats".
      await clearCachedMessages();

      set({ messages: [] });
      return true;
    } catch (error) {
      console.error('🔴 Failed to clear chat history:', error.response?.data || error.message);
      return false;
    }
  },

  // ✅ BLUE TICK PROTOCOL: Emit read confirmation to the backend.
  // Called by the ChatPane IntersectionObserver when incoming bubbles enter view.
  markMessagesAsRead: (conversationId, messageIds, receiverId) => {
    const socket = useSocketStore.getState().socket;
    if (!socket || !conversationId || !messageIds || messageIds.length === 0) return;

    socket.emit('message:mark-read', { conversationId, messageIds, receiverId });

    // Optimistically flag the incoming messages locally so the observer
    // never re-fires for them within this session.
    set((state) => ({
      messages: state.messages.map((m) =>
        messageIds.some((id) => sameId(id, m._id)) ? { ...m, isRead: true } : m
      ),
    }));
  },

  // ⚡ PHASE 2: Send an already-encrypted+uploaded attachment (image/video/audio).
  // The binary is encrypted & uploaded by the caller (ChatPane via lib/media.js);
  // here we just persist the reference + an optional E2E-encrypted caption, then
  // optimistically add the saved message to the feed. This is ADDITIVE — it does
  // not alter the text send/decrypt pipeline.
  sendAttachmentMessage: async (conversationId, attachment, caption, receiverId) => {
    set({ isSending: true });
    try {
      const token = await auth.currentUser.getIdToken();

      const chatStore = useChatStore.getState();
      const conversation = chatStore.conversations.find((c) => sameId(c._id, conversationId));
      const currentUser = useAuthStore.getState().authUser || useAuthStore.getState().user;

      // Encrypt the caption (if any) with the conversation key, mirroring text sends.
      let textToSend = caption || '';
      let encryptionKey = null;
      if (caption) {
        encryptionKey = await deriveConversationKey(conversation, currentUser);
        if (encryptionKey) {
          try {
            const encryptedPayload = await encryptText(caption, encryptionKey);
            textToSend = JSON.stringify(encryptedPayload);
          } catch (err) {
            console.error('Failed to encrypt caption:', err);
            textToSend = caption;
          }
        }
      }

      const res = await api.post(
        `/messages/${conversationId}`,
        {
          text: textToSend,
          attachmentUrl: attachment.url,
          attachmentType: attachment.type,
          attachmentMime: attachment.mime,
          receiverId,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      let savedMessage = res.data.data;
      // Decrypt our own caption back for immediate display.
      if (encryptionKey && savedMessage.text) {
        try {
          const parsed = JSON.parse(savedMessage.text);
          if (parsed?.iv && parsed?.ciphertext) {
            savedMessage = { ...savedMessage, text: await decryptText(parsed, encryptionKey) };
          }
        } catch {
          // plaintext caption — leave as-is
        }
      }

      const updatedMessages = [...get().messages, savedMessage].sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
      );
      set({ messages: updatedMessages });
      useChatStore.getState().updateConversationLastMessage(conversationId, savedMessage);

      // ⚡ PHASE 3: persist the decrypted attachment message (metadata + caption)
      // to the local cache. The blob: URL is intentionally NOT stored — it's
      // session-scoped; EncryptedMedia re-fetches & decrypts from attachmentUrl.
      cacheMessage(savedMessage);

      return true;
    } catch (error) {
      console.error('🔴 Failed to send attachment:', error.response?.data || error.message);
      return false;
    } finally {
      set({ isSending: false });
    }
  },

  fetchMessages: async (conversationId) => {
    if (!conversationId) return;

    // ⚡ PHASE 3 — OFFLINE-FIRST: paint the locally-cached history FIRST, before
    // any network round-trip. These records were decrypted when first stored, so
    // old messages render instantly with zero key math. Only show the blocking
    // spinner when we have nothing cached for this conversation.
    const cached = await getCachedMessages(conversationId);
    set({ messages: cached, isFetching: cached.length === 0 });

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error('No active session token found');
      }

      // ⚡ PHASE 3 — DELTA SYNC: only ask the server for messages newer than our
      // newest cached one. Empty cache → full history fetch.
      const since = cached.length ? cached[cached.length - 1].createdAt : null;
      const res = await api.get(`/messages/${conversationId}`, {
        headers: { Authorization: `Bearer ${token}` },
        params: since ? { after: since } : undefined,
      });

      // ===== EXISTING E2E DECRYPTION (unchanged) — now over the DELTA set =====
      let decryptedMessages = res.data.data;
      const chatStore = useChatStore.getState();
      const conversation = chatStore.conversations.find(c => c._id === conversationId);
      const currentUser = useAuthStore.getState().authUser || useAuthStore.getState().user;
      const otherParticipant = conversation?.participants?.find(p => p._id !== currentUser?._id);
      const privateKeyJwk = localStorage.getItem("zync_private_key");

      if (conversation && !conversation.isGroup && privateKeyJwk && otherParticipant && otherParticipant.publicKey) {
        try {
          const myPrivKeyObj = await importPrivateKey(privateKeyJwk);
          const theirPubKeyObj = await importPublicKey(otherParticipant.publicKey);
          const sharedSecretKey = await deriveSharedSecret(myPrivKeyObj, theirPubKeyObj);

          decryptedMessages = await Promise.all(
            res.data.data.map(async (msg) => ({ ...msg, text: await safeDecryptMessage(msg, sharedSecretKey) }))
          );
        } catch (err) {
          console.error("Failed to decrypt historical messages:", err);
        }
      }

      // ⚡ VECTOR 2: Group E2EE — unwrap the shared group key and decrypt the feed.
      // Falls back to raw text for legacy groups (no encryptedGroupKeys).
      if (conversation?.isGroup) {
        const groupKey = await deriveGroupKey(conversation, currentUser);
        if (groupKey) {
          decryptedMessages = await decryptMessagesWith(res.data.data, groupKey);
        }
      }
      // ===== END EXISTING E2E DECRYPTION =====

      // ⚡ PHASE 3: persist the freshly-decrypted delta, then merge it into the
      // feed (dedupe by _id; a socket message may have landed mid-sync).
      await cacheMessages(decryptedMessages);

      set((state) => {
        const byId = new Map();
        for (const m of state.messages) byId.set(String(m._id), m);
        for (const m of decryptedMessages) byId.set(String(m._id), m);
        const merged = [...byId.values()].sort(
          (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
        );
        return { messages: merged };
      });
    } catch (error) {
      console.error('Failed to fetch messages:', error.stack || error);
    } finally {
      set({ isFetching: false });
    }
  },

  getMessages: async (conversationId) => {
    return get().fetchMessages(conversationId);
  },

// Change the parameters to accept 'image'
  sendMessage: async (conversationId, text, image, receiverId) => {
    set({ isSending: true });

    // ===== EXISTING E2E ENCRYPTION (unchanged) — runs purely locally, BEFORE any
    // network I/O, so the optimistic bubble can paint instantly even offline. =====
    let textToSend = text;
    // Unified cipher key: the 1-on-1 ECDH shared secret OR the group AES key.
    let encryptionKey = null;
    const privateKeyJwk = localStorage.getItem("zync_private_key");

    const chatStore = useChatStore.getState();
    const conversation = chatStore.conversations.find(c => sameId(c._id, conversationId));
    const currentUser = useAuthStore.getState().authUser || useAuthStore.getState().user;
    // ⚡ KEY-FRESHNESS: resolve the peer from the LIVE store (hard-refreshed by
    // getConversations on boot), so we always encrypt against the most recently
    // fetched publicKey — never a stale snapshot. sameId guards type mismatches.
    const otherParticipant = conversation?.participants?.find(p => sameId(p._id, receiverId))
      || conversation?.participants?.find(p => !sameId(p._id, currentUser?._id));

    if (conversation?.isGroup && text) {
      // ⚡ VECTOR 2: Group E2EE — encrypt with the shared group symmetric key.
      const groupKey = await deriveGroupKey(conversation, currentUser);
      if (groupKey) {
        try {
          const encryptedPayload = await encryptText(text, groupKey);
          textToSend = JSON.stringify(encryptedPayload);
          encryptionKey = groupKey;
        } catch (err) {
          console.error("Failed to encrypt group message text:", err);
          textToSend = text;
          encryptionKey = null;
        }
      }
      // else: legacy group with no key → send plaintext
    } else if (conversation && !conversation.isGroup && privateKeyJwk && otherParticipant && otherParticipant.publicKey && text) {
      try {
        const myPrivKeyObj = await importPrivateKey(privateKeyJwk);
        const theirPubKeyObj = await importPublicKey(otherParticipant.publicKey);
        encryptionKey = await deriveSharedSecret(myPrivKeyObj, theirPubKeyObj);
        const encryptedPayload = await encryptText(text, encryptionKey);
        textToSend = JSON.stringify(encryptedPayload);
      } catch (err) {
        console.error("Failed to encrypt message text:", err);
      }
    }
    // ===== END EXISTING E2E ENCRYPTION =====

    // ⚡ PHASE 3.5 — OPTIMISTIC MESSAGE: paint the bubble BEFORE the network call.
    // The wire payload (`textToSend`) carries the encrypted ciphertext, but the
    // optimistic record stores the PLAINTEXT `text` for display (the feed renders
    // msg.text directly) and stashes everything needed to replay the send while
    // offline. createdAt is an ISO string — Dexie sortBy compares it as a string
    // key, so a numeric Date.now() would jump pending bubbles to the top.
    const tempId = `temp_${Date.now()}`;
    const optimisticMessage = {
      _id: tempId,
      conversationId,
      senderId: currentUser?._id,
      text,                 // plaintext for the UI
      image: image || null,
      createdAt: new Date().toISOString(),
      isRead: false,
      status: 'pending',
      // Outbox payload — the wire-ready ciphertext + routing, replayed verbatim
      // by resendPendingMessages once connectivity returns.
      pendingPayload: { text: textToSend, image: image || null, receiverId },
    };

    // IMMEDIATE paint + persist so the message survives a reload while still pending.
    set((state) => ({
      messages: [...state.messages, optimisticMessage].sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
      ),
    }));
    cacheMessage(optimisticMessage);
    useChatStore.getState().updateConversationLastMessage(conversationId, optimisticMessage);

    try {
      const token = await auth.currentUser.getIdToken();

      // ⚡ Include the image in the JSON payload
      const res = await api.post(`/messages/${conversationId}`,
        { text: textToSend, image, receiverId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      let savedMessage = res.data.data;
      if (encryptionKey && savedMessage.text) {
        try {
          const parsed = JSON.parse(savedMessage.text);
          if (parsed && typeof parsed === 'object' && parsed.iv && parsed.ciphertext) {
            const decryptedText = await decryptText(parsed, encryptionKey);
            savedMessage = { ...savedMessage, text: decryptedText };
          }
        } catch {
          // Ignore
        }
      }

      // ⚡ PHASE 3.5 — CONFIRM: swap the temp bubble for the real server message
      // (now carrying its MongoDB _id), keeping the feed chronological. The sort
      // also covers the race where a Groq reply lands over the socket before this
      // POST resolves.
      set((state) => {
        const withoutTemp = state.messages.filter((m) => !sameId(m._id, tempId));
        const merged = [...withoutTemp, savedMessage].sort(
          (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
        );
        return { messages: merged };
      });

      // ⚡ THE FIX: Use your actual store method name and pass the conversationId
      useChatStore.getState().updateConversationLastMessage(conversationId, savedMessage);

      // ⚡ PHASE 3: drop the optimistic temp record, persist the confirmed message.
      await deleteCachedMessage(tempId);
      cacheMessage(savedMessage);

      return true;
    } catch (error) {
      // ⚡ PHASE 3.5 — OFFLINE: the send failed (no network). Leave the bubble in
      // the store AND Dexie flagged `status: 'pending'` so it stays visible and
      // gets replayed by resendPendingMessages on reconnect. Swallow the error so
      // there's no unhandled rejection and no crash.
      console.warn("📭 Message queued offline (will retry on reconnect):", error?.message || error);
      return false;
    } finally {
      set({ isSending: false });
    }
  },

  // ⚡ PHASE 3.5 — OFFLINE OUTBOX REPLAY: drain every `status: 'pending'` message
  // from Dexie and re-POST it. Invoked by the socket lifecycle on reconnect /
  // browser 'online'. Each pending record already holds the wire-ready ciphertext
  // (pendingPayload) and the plaintext (msg.text) we reuse for display — so no key
  // re-derivation is needed and the E2E pipeline is untouched. Best-effort: if a
  // resend still fails (flaky reconnect), the message stays pending for next time.
  resendPendingMessages: async () => {
    const pending = await getPendingMessages();
    if (!pending.length) return;

    for (const msg of pending) {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return; // session gone — keep everything queued

        const payload = msg.pendingPayload || {
          text: msg.text,
          image: msg.image || null,
          receiverId: msg.receiverId,
        };

        const res = await api.post(`/messages/${msg.conversationId}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });

        // Reuse the plaintext we already know (msg.text) rather than re-deriving
        // the key to decrypt the echoed ciphertext.
        const savedMessage = { ...res.data.data, text: msg.text };

        set((state) => {
          const withoutTemp = state.messages.filter((m) => !sameId(m._id, msg._id));
          const exists = withoutTemp.some((m) => sameId(m._id, savedMessage._id));
          const next = exists ? withoutTemp : [...withoutTemp, savedMessage];
          return {
            messages: next.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
          };
        });

        await deleteCachedMessage(msg._id);
        cacheMessage(savedMessage);
        useChatStore.getState().updateConversationLastMessage(msg.conversationId, savedMessage);
      } catch (error) {
        // Still offline / server unreachable — leave this one pending and stop;
        // a later 'online'/reconnect event will trigger another drain.
        console.warn("📭 Pending resend failed, will retry later:", error?.message || error);
        return;
      }
    }
  },
  subscribeToMessages: (currentConversationId) => {
    const socket = useSocketStore.getState().socket;
    if (!socket || !currentConversationId) return;

    if (messageHandler) {
      socket.off('newMessage', messageHandler);
    }

    messageHandler = async (newMessage) => {
      if (!sameId(newMessage.conversationId, currentConversationId)) return;

      let decryptedMsg = newMessage;
      if (newMessage.text) {
        const privateKeyJwk = localStorage.getItem("zync_private_key");
        const chatStore = useChatStore.getState();
        const conversation = chatStore.conversations.find(c => sameId(c._id, currentConversationId));
        const currentUser = useAuthStore.getState().authUser || useAuthStore.getState().user;
        const otherParticipant = conversation?.participants?.find(p => !sameId(p._id, currentUser?._id));

        if (conversation?.isGroup) {
          // ⚡ VECTOR 2: Group E2EE — decrypt inbound message with the group key.
          const groupKey = await deriveGroupKey(conversation, currentUser);
          decryptedMsg = { ...newMessage, text: await safeDecryptMessage(newMessage, groupKey) };
        } else if (conversation && !conversation.isGroup && privateKeyJwk && otherParticipant && otherParticipant.publicKey) {
          // ⚡ Includes the AI gateway: ECDH symmetry means our shared secret
          // matches the one the server used to wrap the AI's reply.
          let sharedSecretKey = null;
          try {
            const myPrivKeyObj = await importPrivateKey(privateKeyJwk);
            const theirPubKeyObj = await importPublicKey(otherParticipant.publicKey);
            sharedSecretKey = await deriveSharedSecret(myPrivKeyObj, theirPubKeyObj);
          } catch (e) {
            console.error("🔴 E2E: failed to derive shared secret for inbound message:", e);
          }
          decryptedMsg = { ...newMessage, text: await safeDecryptMessage(newMessage, sharedSecretKey) };
        }
      }

      set((state) => {
        const exists = state.messages.some((m) => sameId(m._id, decryptedMsg._id));
        if (exists) return state;
        // ⚡ RACE-CONDITION FIX: keep the feed chronological even when a fast AI
        // socket reply lands before/around the human's own message resolves.
        const updatedMessages = [...state.messages, decryptedMsg].sort(
          (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
        );
        return { messages: updatedMessages };
      });

      // ⚡ PHASE 3: persist the decrypted inbound message to the local cache so it
      // survives reloads. Idempotent put — safe even if it was already present.
      cacheMessage(decryptedMsg);
    };

    // ⚡ KEY-FRESHNESS FIX: register the proper handler. It re-reads the peer's
    // publicKey from useChatStore on every message — and that store is hard-
    // overwritten by getConversations on boot — so a rotated key can never
    // desync the decryption math. (Replaces a broken inline handler that called
    // deriveSharedSecret(conversationId) with one bad arg → OperationError, and
    // referenced an undefined AI_USER_ID. The AI gateway is already handled by
    // messageHandler via ECDH symmetry.)
    socket.on('newMessage', messageHandler);

    // ✅ BLUE TICK PROTOCOL: Listen for the sender-side confirmation.
    // When the other user reads our messages, flip the matching bubbles to read.
    if (readReceiptHandler) {
      socket.off('message:read', readReceiptHandler);
    }

    readReceiptHandler = ({ conversationId, messageIds }) => {
      if (!sameId(conversationId, currentConversationId)) return;
      if (!Array.isArray(messageIds) || messageIds.length === 0) return;

      set((state) => ({
        messages: state.messages.map((m) =>
          messageIds.some((id) => sameId(id, m._id)) ? { ...m, isRead: true } : m
        ),
      }));
    };

    socket.on('message:read', readReceiptHandler);
  },

  unsubscribeFromMessages: () => {
    const socket = useSocketStore.getState().socket;
    if (!socket) return;
    if (messageHandler) {
      socket.off('newMessage', messageHandler);
      messageHandler = null;
    }
    if (readReceiptHandler) {
      socket.off('message:read', readReceiptHandler);
      readReceiptHandler = null;
    }
  },
}));
