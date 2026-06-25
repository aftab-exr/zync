import { create } from 'zustand';
import { api } from '../lib/axios';
import { auth, getAuthToken } from '../lib/firebase';
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
let messageEditedHandler = null;
let messageDeletedEveryoneHandler = null;
let messageDeletedMeHandler = null;

// Decrypt message helper, bypasses decryption for plain text or system call logs.
const safeDecryptMessage = async (msg, sharedSecret) => {
    if (!msg || !msg.text) return "";
    if (msg.isDecrypted === true) return msg.text;
    if (msg.messageType === "call_log") return msg.text;
    try {
        const parsed = JSON.parse(msg.text);
        if (!parsed.iv || !parsed.ciphertext) return msg.text;

        if (!sharedSecret) {
            return "🔒 [Encrypted Message - Awaiting Key Sync]";
        }

        const decryptedText = await decryptText(parsed, sharedSecret);
        if (!decryptedText || decryptedText === "[Encrypted Message - Unreadable]") {
            return "🔒 [Encrypted Message - Mathematical Mismatch]";
        }

        return decryptedText;
    } catch (e) {
        if (e.name === "SyntaxError") return msg.text;
        return "🔒 [Encrypted Message - Mathematical Mismatch]";
    }
};

const deriveGroupKey = async (conversation, currentUser) => {
  if (!conversation?.isGroup) return null;

  const groupKeys = conversation.encryptedGroupKeys;
  if (!Array.isArray(groupKeys) || groupKeys.length === 0) return null;

  const myEntry = groupKeys.find((k) => sameId(k.userId, currentUser?._id));
  if (!myEntry?.encryptedKeyPayload) return null;

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
    return null;
  }
};

const decryptMessagesWith = async (messages, key) => {
  return Promise.all(
    messages.map(async (message) => {
      if (message.isDecrypted === true) {
        return message;
      }
      return { ...message, text: await safeDecryptMessage(message, key) };
    })
  );
};

export const useMessageStore = create((set, get) => ({
  messages: [],
  isFetching: false,
  hasMore: true,
  typingConversations: {},

  setTypingState: (conversationId, isTyping) => {
    set((state) => ({
      typingConversations: {
        ...state.typingConversations,
        [conversationId]: isTyping,
      },
    }));
  },

  clearAllMessages: async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('No active session token found');

      await api.delete('/messages/clear', {
        headers: { Authorization: `Bearer ${token}` },
      });

      await clearCachedMessages();
      set({ messages: [] });
      return true;
    } catch (error) {
      return false;
    }
  },

  markMessagesAsRead: (conversationId, messageIds, receiverId) => {
    const socket = useSocketStore.getState().socket;
    if (!socket || !conversationId || !messageIds || messageIds.length === 0) return;

    socket.emit('message:mark-read', { conversationId, messageIds, receiverId });

    set((state) => ({
      messages: state.messages.map((m) =>
        messageIds.some((id) => sameId(id, m._id)) ? { ...m, isRead: true } : m
      ),
    }));
  },

  sendAttachmentMessage: async (conversationId, attachment, caption, receiverId) => {
    set({ isSending: true });
    try {
      const token = await auth.currentUser.getIdToken();

      const chatStore = useChatStore.getState();
      const conversation = chatStore.conversations.find((c) => sameId(c._id, conversationId));
      const currentUser = useAuthStore.getState().authUser || useAuthStore.getState().user;

      let textToSend = caption || '';
      let encryptionKey = null;
      if (caption) {
        encryptionKey = await deriveConversationKey(conversation, currentUser);
        if (encryptionKey) {
          try {
            const encryptedPayload = await encryptText(caption, encryptionKey);
            textToSend = JSON.stringify(encryptedPayload);
          } catch (err) {
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
      if (encryptionKey && savedMessage.text) {
        try {
          const parsed = JSON.parse(savedMessage.text);
          if (parsed?.iv && parsed?.ciphertext) {
            savedMessage = { ...savedMessage, text: await decryptText(parsed, encryptionKey) };
          }
        } catch {
          // Plaintext fallback
        }
      }

      const updatedMessages = [...get().messages, savedMessage].sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
      );
      set({ messages: updatedMessages });
      useChatStore.getState().updateConversationLastMessage(conversationId, savedMessage);

      cacheMessage(savedMessage);
      return true;
    } catch (error) {
      return false;
    } finally {
      set({ isSending: false });
    }
  },

  fetchMessages: async (conversationId) => {
    if (!conversationId) return;

    const cachedRaw = await getCachedMessages(conversationId);
    const cached = cachedRaw.map((m) => ({ ...m, isDecrypted: true }));
    set({ messages: cached, isFetching: cached.length === 0 });

    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('No active session token found');
      }

      const res = await api.get('/messages/' + conversationId, {
        headers: { Authorization: 'Bearer ' + token }
      });

      const responseData = res.data.data;
      let newMessages = Array.isArray(responseData) ? responseData : (responseData?.messages || []);
      const nextCursor = Array.isArray(responseData) ? null : (responseData?.nextCursor || null);

      let decryptedMessages = newMessages;
      const chatStore = useChatStore.getState();
      const conversation = chatStore.conversations.find(c => sameId(c._id, conversationId));
      const currentUser = useAuthStore.getState().authUser || useAuthStore.getState().user;
      const otherParticipant = conversation?.participants?.find(p => p._id !== currentUser?._id);
      const privateKeyJwk = localStorage.getItem("zync_private_key");

      if (conversation && !conversation.isGroup && privateKeyJwk && otherParticipant && otherParticipant.publicKey) {
        try {
          const myPrivKeyObj = await importPrivateKey(privateKeyJwk);
          const theirPubKeyObj = await importPublicKey(otherParticipant.publicKey);
          const sharedSecretKey = await deriveSharedSecret(myPrivKeyObj, theirPubKeyObj);

          decryptedMessages = await Promise.all(
            newMessages.map(async (message) => {
              if (message.isDecrypted === true) {
                return message;
              }
              return { ...message, text: await safeDecryptMessage(message, sharedSecretKey) };
            })
          );
        } catch (err) {
          // Handled silently
        }
      }

      if (conversation?.isGroup) {
        const groupKey = await deriveGroupKey(conversation, currentUser);
        if (groupKey) {
          decryptedMessages = await decryptMessagesWith(newMessages, groupKey);
        }
      }

      set({ messages: decryptedMessages, isFetching: false, hasMore: !!nextCursor });
      await cacheMessages(decryptedMessages);
    } catch (error) {
      set({ isFetching: false });
    }
  },

  fetchMoreMessages: async (conversationId) => {
    const { messages, hasMore, isFetching } = get();
    if (!conversationId || !hasMore || isFetching || messages.length === 0) return;

    const oldestMessage = messages[0];
    if (!oldestMessage || oldestMessage.status === 'pending') return;
    const cursor = oldestMessage._id;

    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('No active session token found');
      }

      const res = await api.get(`/messages/${conversationId}?cursor=${cursor}&limit=30`, {
        headers: { Authorization: 'Bearer ' + token }
      });

      const responseData = res.data.data;
      let newMessages = Array.isArray(responseData) ? responseData : (responseData?.messages || []);
      const nextCursor = Array.isArray(responseData) ? null : (responseData?.nextCursor || null);

      if (newMessages.length === 0) {
        set({ hasMore: false });
        return;
      }

      // Decrypt new messages
      const chatStore = useChatStore.getState();
      const conversation = chatStore.conversations.find(c => sameId(c._id, conversationId));
      const currentUser = useAuthStore.getState().authUser || useAuthStore.getState().user;
      const otherParticipant = conversation?.participants?.find(p => p._id !== currentUser?._id);
      const privateKeyJwk = localStorage.getItem("zync_private_key");

      let decryptedMessages = newMessages;
      if (conversation && !conversation.isGroup && privateKeyJwk && otherParticipant && otherParticipant.publicKey) {
        try {
          const myPrivKeyObj = await importPrivateKey(privateKeyJwk);
          const theirPubKeyObj = await importPublicKey(otherParticipant.publicKey);
          const sharedSecretKey = await deriveSharedSecret(myPrivKeyObj, theirPubKeyObj);

          decryptedMessages = await Promise.all(
            newMessages.map(async (message) => {
              if (message.isDecrypted === true) return message;
              return { ...message, text: await safeDecryptMessage(message, sharedSecretKey) };
            })
          );
        } catch (err) {
          // Handled silently
        }
      }

      if (conversation?.isGroup) {
        const groupKey = await deriveGroupKey(conversation, currentUser);
        if (groupKey) {
          decryptedMessages = await decryptMessagesWith(newMessages, groupKey);
        }
      }

      set((state) => {
        const existingIds = new Set(state.messages.map((m) => m._id));
        const filteredNew = decryptedMessages.filter((m) => !existingIds.has(m._id));
        const merged = [...filteredNew, ...state.messages].sort(
          (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
        );
        return {
          messages: merged,
          hasMore: !!nextCursor
        };
      });

      await cacheMessages(decryptedMessages);
    } catch (error) {
      console.error("fetchMoreMessages error:", error);
    }
  },

  getMessages: async (conversationId) => {
    return get().fetchMessages(conversationId);
  },

  sendMessage: async (conversationId, text, image, receiverId) => {
    set({ isSending: true });

    let textToSend = text;
    let encryptionKey = null;
    const privateKeyJwk = localStorage.getItem("zync_private_key");

    const chatStore = useChatStore.getState();
    const conversation = chatStore.conversations.find(c => sameId(c._id, conversationId));
    const currentUser = useAuthStore.getState().authUser || useAuthStore.getState().user;
    const otherParticipant = conversation?.participants?.find(p => sameId(p._id, receiverId))
      || conversation?.participants?.find(p => !sameId(p._id, currentUser?._id));

    if (conversation?.isGroup && text) {
      const groupKey = await deriveGroupKey(conversation, currentUser);
      if (groupKey) {
        try {
          const encryptedPayload = await encryptText(text, groupKey);
          textToSend = JSON.stringify(encryptedPayload);
          encryptionKey = groupKey;
        } catch (err) {
          textToSend = text;
          encryptionKey = null;
        }
      }
    } else if (conversation && !conversation.isGroup && privateKeyJwk && otherParticipant && otherParticipant.publicKey && text) {
      try {
        const myPrivKeyObj = await importPrivateKey(privateKeyJwk);
        const theirPubKeyObj = await importPublicKey(otherParticipant.publicKey);
        encryptionKey = await deriveSharedSecret(myPrivKeyObj, theirPubKeyObj);
        const encryptedPayload = await encryptText(text, encryptionKey);
        textToSend = JSON.stringify(encryptedPayload);
      } catch (err) {
        // Handled silently
      }
    }

    const tempId = `temp_${Date.now()}`;
    const optimisticMessage = {
      _id: tempId,
      conversationId,
      senderId: currentUser?._id,
      text,
      image: image || null,
      createdAt: new Date().toISOString(),
      isRead: false,
      status: 'pending',
      pendingPayload: { text: textToSend, image: image || null, receiverId },
    };

    set((state) => ({
      messages: [...state.messages, optimisticMessage].sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
      ),
    }));
    cacheMessage(optimisticMessage);
    useChatStore.getState().updateConversationLastMessage(conversationId, optimisticMessage);

    try {
      const token = await auth.currentUser.getIdToken();

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
          // Handled silently
        }
      }

      set((state) => {
        const withoutTemp = state.messages.filter((m) => !sameId(m._id, tempId));
        const merged = [...withoutTemp, savedMessage].sort(
          (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
        );
        return { messages: merged };
      });

      useChatStore.getState().updateConversationLastMessage(conversationId, savedMessage);

      await deleteCachedMessage(tempId);
      cacheMessage(savedMessage);

      return true;
    } catch (error) {
      return false;
    } finally {
      set({ isSending: false });
    }
  },

  resendPendingMessages: async () => {
    const pending = await getPendingMessages();
    if (!pending.length) return;

    for (const msg of pending) {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;

        const payload = msg.pendingPayload || {
          text: msg.text,
          image: msg.image || null,
          receiverId: msg.receiverId,
        };

        const res = await api.post(`/messages/${msg.conversationId}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });

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
      if (newMessage.text && newMessage.messageType !== "call_log") {
        const privateKeyJwk = localStorage.getItem("zync_private_key");
        const chatStore = useChatStore.getState();
        const conversation = chatStore.conversations.find(c => sameId(c._id, currentConversationId));
        const currentUser = useAuthStore.getState().authUser || useAuthStore.getState().user;
        const otherParticipant = conversation?.participants?.find(p => !sameId(p._id, currentUser?._id));

        if (conversation?.isGroup) {
          const groupKey = await deriveGroupKey(conversation, currentUser);
          decryptedMsg = { ...newMessage, text: await safeDecryptMessage(newMessage, groupKey) };
        } else if (conversation && !conversation.isGroup && privateKeyJwk && otherParticipant && otherParticipant.publicKey) {
          let sharedSecretKey = null;
          try {
            const myPrivKeyObj = await importPrivateKey(privateKeyJwk);
            const theirPubKeyObj = await importPublicKey(otherParticipant.publicKey);
            sharedSecretKey = await deriveSharedSecret(myPrivKeyObj, theirPubKeyObj);
          } catch (e) {
            // Handled silently
          }
          decryptedMsg = { ...newMessage, text: await safeDecryptMessage(newMessage, sharedSecretKey) };
        }
      }

      set((state) => {
        const exists = state.messages.some((m) => sameId(m._id, decryptedMsg._id));
        if (exists) return state;
        const updatedMessages = [...state.messages, decryptedMsg].sort(
          (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
        );
        return { messages: updatedMessages };
      });

      cacheMessage(decryptedMsg);
    };

    socket.on('newMessage', messageHandler);

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

    if (messageEditedHandler) {
      socket.off('message:edited', messageEditedHandler);
    }
    messageEditedHandler = async (editedMessage) => {
      if (!sameId(editedMessage.conversationId, currentConversationId)) return;
      let decryptedText = editedMessage.text;
      if (editedMessage.text && editedMessage.messageType !== "call_log") {
        const privateKeyJwk = localStorage.getItem("zync_private_key");
        const chatStore = useChatStore.getState();
        const conversation = chatStore.conversations.find(c => sameId(c._id, currentConversationId));
        const currentUser = useAuthStore.getState().authUser || useAuthStore.getState().user;
        const otherParticipant = conversation?.participants?.find(p => !sameId(p._id, currentUser?._id));

        if (conversation?.isGroup) {
          const groupKey = await deriveGroupKey(conversation, currentUser);
          decryptedText = await safeDecryptMessage(editedMessage, groupKey);
        } else if (conversation && !conversation.isGroup && privateKeyJwk && otherParticipant && otherParticipant.publicKey) {
          let sharedSecretKey = null;
          try {
            const myPrivKeyObj = await importPrivateKey(privateKeyJwk);
            const theirPubKeyObj = await importPublicKey(otherParticipant.publicKey);
            sharedSecretKey = await deriveSharedSecret(myPrivKeyObj, theirPubKeyObj);
          } catch (e) {
            // Handled silently
          }
          decryptedText = await safeDecryptMessage(editedMessage, sharedSecretKey);
        }
      }

      set((state) => ({
        messages: state.messages.map((m) =>
          sameId(m._id, editedMessage._id) ? { ...m, text: decryptedText, isEdited: true, updatedAt: editedMessage.updatedAt } : m
        ),
      }));

      const updatedMsg = get().messages.find(m => sameId(m._id, editedMessage._id));
      if (updatedMsg) {
        cacheMessage(updatedMsg);
      }
    };
    socket.on('message:edited', messageEditedHandler);

    if (messageDeletedEveryoneHandler) {
      socket.off('message:deletedForEveryone', messageDeletedEveryoneHandler);
    }
    messageDeletedEveryoneHandler = ({ _id, conversationId, updatedAt }) => {
      if (!sameId(conversationId, currentConversationId)) return;
      set((state) => ({
        messages: state.messages.map((m) =>
          sameId(m._id, _id)
            ? {
                ...m,
                text: "",
                imageUrl: "",
                attachmentUrl: "",
                attachmentType: "",
                attachmentMime: "",
                deletedForEveryone: true,
                updatedAt
              }
            : m
        ),
      }));

      const updatedMsg = get().messages.find(m => sameId(m._id, _id));
      if (updatedMsg) {
        cacheMessage(updatedMsg);
      }
    };
    socket.on('message:deletedForEveryone', messageDeletedEveryoneHandler);

    if (messageDeletedMeHandler) {
      socket.off('message:deletedForMe', messageDeletedMeHandler);
    }
    messageDeletedMeHandler = ({ _id, conversationId }) => {
      if (!sameId(conversationId, currentConversationId)) return;
      set((state) => ({
        messages: state.messages.filter((m) => !sameId(m._id, _id)),
      }));
      deleteCachedMessage(_id);
    };
    socket.on('message:deletedForMe', messageDeletedMeHandler);
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
    if (messageEditedHandler) {
      socket.off('message:edited', messageEditedHandler);
      messageEditedHandler = null;
    }
    if (messageDeletedEveryoneHandler) {
      socket.off('message:deletedForEveryone', messageDeletedEveryoneHandler);
      messageDeletedEveryoneHandler = null;
    }
    if (messageDeletedMeHandler) {
      socket.off('message:deletedForMe', messageDeletedMeHandler);
      messageDeletedMeHandler = null;
    }
  },

  editMessage: async (messageId, newText) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return false;

      const chatStore = useChatStore.getState();
      const currentMessage = get().messages.find(m => sameId(m._id, messageId));
      if (!currentMessage) return false;

      const conversation = chatStore.conversations.find(c => sameId(c._id, currentMessage.conversationId));
      const currentUser = useAuthStore.getState().authUser || useAuthStore.getState().user;
      const otherParticipant = conversation?.participants?.find(p => !sameId(p._id, currentUser?._id));
      const privateKeyJwk = localStorage.getItem("zync_private_key");

      let textToSend = newText;
      let encryptionKey = null;

      if (conversation?.isGroup) {
        const groupKey = await deriveGroupKey(conversation, currentUser);
        if (groupKey) {
          const encryptedPayload = await encryptText(newText, groupKey);
          textToSend = JSON.stringify(encryptedPayload);
        }
      } else if (conversation && !conversation.isGroup && privateKeyJwk && otherParticipant && otherParticipant.publicKey) {
        const myPrivKeyObj = await importPrivateKey(privateKeyJwk);
        const theirPubKeyObj = await importPublicKey(otherParticipant.publicKey);
        encryptionKey = await deriveSharedSecret(myPrivKeyObj, theirPubKeyObj);
        const encryptedPayload = await encryptText(newText, encryptionKey);
        textToSend = JSON.stringify(encryptedPayload);
      }

      await api.put(`/messages/${messageId}/edit`, { text: textToSend }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      set((state) => ({
        messages: state.messages.map((m) =>
          sameId(m._id, messageId) ? { ...m, text: newText, isEdited: true } : m
        ),
      }));

      const updatedMsg = get().messages.find(m => sameId(m._id, messageId));
      if (updatedMsg) {
        await cacheMessage(updatedMsg);
      }

      return true;
    } catch (err) {
      return false;
    }
  },

  deleteMessageForEveryone: async (messageId) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return false;

      await api.delete(`/messages/${messageId}/everyone`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      set((state) => ({
        messages: state.messages.map((m) =>
          sameId(m._id, messageId)
            ? {
                ...m,
                text: "",
                imageUrl: "",
                attachmentUrl: "",
                attachmentType: "",
                attachmentMime: "",
                deletedForEveryone: true
              }
            : m
        ),
      }));

      const updatedMsg = get().messages.find(m => sameId(m._id, messageId));
      if (updatedMsg) {
        await cacheMessage(updatedMsg);
      }

      return true;
    } catch (err) {
      return false;
    }
  },

  deleteMessageForMe: async (messageId) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return false;

      await api.delete(`/messages/${messageId}/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      set((state) => ({
        messages: state.messages.filter((m) => !sameId(m._id, messageId)),
      }));

      await deleteCachedMessage(messageId);
      return true;
    } catch (err) {
      return false;
    }
  },
}));
