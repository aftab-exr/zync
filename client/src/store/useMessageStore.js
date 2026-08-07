import { create } from 'zustand';
import { api } from '../lib/axios';
import { auth, getAuthToken } from '../lib/firebase';
import { useSocketStore } from './useSocketStore';
import { useChatStore } from './useChatStore';
import { useAuthStore } from './useAuthStore';
import { sameId } from '../lib/conversation';
import { cacheMessage, cacheMessages, getCachedMessages, clearCachedMessages, deleteCachedMessage, getPendingMessages } from '../lib/db';
import { 
  decryptConversationMessages,
  encryptForConversation 
} from '../services/decryption';

let messageHandler = null;
let readReceiptHandler = null;
let messageEditedHandler = null;
let messageDeletedEveryoneHandler = null;
let messageDeletedMeHandler = null;

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
    } catch {
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
      const currentUser = useAuthStore.getState().user;

      let textToSend = caption || '';
      if (caption) {
        textToSend = await encryptForConversation(caption, conversation, currentUser);
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
      // Decrypt the saved message for local display
      const decryptedMessages = await decryptConversationMessages(conversationId, [savedMessage]);
      savedMessage = decryptedMessages[0] || savedMessage;

      const updatedMessages = [...get().messages, savedMessage].sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
      );
      set({ messages: updatedMessages });
      useChatStore.getState().updateConversationLastMessage(conversationId, savedMessage);

      cacheMessage(savedMessage);
      return true;
    } catch {
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

      // Use centralized decryption service
      const decryptedMessages = await decryptConversationMessages(conversationId, newMessages);

      set({ messages: decryptedMessages, isFetching: false, hasMore: !!nextCursor });
      await cacheMessages(decryptedMessages);
    } catch (error) {
      set({ isFetching: false });
      throw error;
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

      // Use centralized decryption service
      const decryptedMessages = await decryptConversationMessages(conversationId, newMessages);

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
    } catch {
        console.error('fetchMoreMessages error:');
    }
  },

  getMessages: async (conversationId) => {
    let attempts = 3;
    for (let i = 0; i < attempts; i++) {
      try {
        return await get().fetchMessages(conversationId);
      } catch (error) {
        if (error.response?.status === 400) {
          break;
        }
        if (i === attempts - 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500 * (i + 1)));
      }
    }
  },

  sendMessage: async (conversationId, text, image, receiverId) => {
    set({ isSending: true });

    const chatStore = useChatStore.getState();
    const conversation = chatStore.conversations.find(c => sameId(c._id, conversationId));
    const currentUser = useAuthStore.getState().user;

    // Encrypt using centralized service
    const textToSend = await encryptForConversation(text, conversation, currentUser);

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
      // Decrypt the saved message for local display
      const decryptedMessages = await decryptConversationMessages(conversationId, [savedMessage]);
      savedMessage = decryptedMessages[0] || savedMessage;

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
    } catch {
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
        // Decrypt for local display
        const decryptedMessages = await decryptConversationMessages(msg.conversationId, [savedMessage]);
        const finalMessage = decryptedMessages[0] || savedMessage;

        set((state) => {
          const withoutTemp = state.messages.filter((m) => !sameId(m._id, msg._id));
          const exists = withoutTemp.some((m) => sameId(m._id, finalMessage._id));
          const next = exists ? withoutTemp : [...withoutTemp, finalMessage];
          return {
            messages: next.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
          };
        });

        await deleteCachedMessage(msg._id);
        cacheMessage(finalMessage);
        useChatStore.getState().updateConversationLastMessage(msg.conversationId, finalMessage);
      } catch {
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

      // Decrypt using centralized service
      const decryptedMessages = await decryptConversationMessages(currentConversationId, [newMessage]);
      const decryptedMsg = decryptedMessages[0] || newMessage;

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

      const decryptedMessages = await decryptConversationMessages(currentConversationId, [editedMessage]);
      const decryptedText = decryptedMessages[0]?.text || editedMessage.text;

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
                text: '',
                imageUrl: '',
                attachmentUrl: '',
                attachmentType: '',
                attachmentMime: '',
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
      const currentUser = useAuthStore.getState().user;

      // Encrypt using centralized service
      const textToSend = await encryptForConversation(newText, conversation, currentUser);

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
    } catch {
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
                text: '',
                imageUrl: '',
                attachmentUrl: '',
                attachmentType: '',
                attachmentMime: '',
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
    } catch {
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
    } catch {
      return false;
    }
  },
}));