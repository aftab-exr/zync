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

  fetchMessages: async (conversationId) => {
    if (!conversationId) return;

    set({ isFetching: true, messages: [] });
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error('No active session token found');
      }
      const res = await api.get(`/messages/${conversationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // E2E Decryption Interception
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

      set({ messages: decryptedMessages });
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
    try {
      const token = await auth.currentUser.getIdToken();
      
      let textToSend = text;
      // Unified cipher key: the 1-on-1 ECDH shared secret OR the group AES key.
      let encryptionKey = null;
      const privateKeyJwk = localStorage.getItem("zync_private_key");

      const chatStore = useChatStore.getState();
      const conversation = chatStore.conversations.find(c => c._id === conversationId);
      const currentUser = useAuthStore.getState().authUser || useAuthStore.getState().user;
      const otherParticipant = conversation?.participants?.find(p => p._id === receiverId)
        || conversation?.participants?.find(p => p._id !== useAuthStore.getState().authUser?._id && p._id !== useAuthStore.getState().user?._id);

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
        } catch (e) {
          // Ignore
        }
      }

      // ⚡ RACE-CONDITION FIX: Groq replies can arrive over the socket BEFORE this
      // HTTP POST resolves, so always re-sort the feed chronologically by createdAt.
      const updatedMessages = [...get().messages, savedMessage].sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
      );
      set({ messages: updatedMessages });
      
      // ⚡ THE FIX: Use your actual store method name and pass the conversationId
      useChatStore.getState().updateConversationLastMessage(conversationId, savedMessage);
      
      return true; 
    } catch (error) {
      console.error("🔴 Failed to send message:", error.response?.data || error.message);
      return false; 
    } finally {
      set({ isSending: false }); 
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
        const conversation = chatStore.conversations.find(c => c._id === currentConversationId);
        const currentUser = useAuthStore.getState().authUser || useAuthStore.getState().user;
        const otherParticipant = conversation?.participants?.find(p => p._id !== currentUser?._id);

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
    };

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
