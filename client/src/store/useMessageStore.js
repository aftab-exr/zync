import { create } from 'zustand';
import { api } from '../lib/axios';
import { auth } from '../lib/firebase';
import { useSocketStore } from './useSocketStore';
import { useChatStore } from './useChatStore';
import { sameId } from '../lib/conversation';

let messageHandler = null;

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
      set({ messages: res.data.data });
    } catch (error) {
      console.error('Failed to fetch messages:', error.stack || error);
    } finally {
      set({ isFetching: false });
    }
  },

  getMessages: async (conversationId) => {
    return get().fetchMessages(conversationId);
  },

  sendMessage: async (conversationId, text, receiverId) => {
    if (!conversationId || !text?.trim()) return null;

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error('No active session token found');
      }
      const res = await api.post(
        `/messages/${conversationId}`,
        { text: text.trim(), receiverId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const incoming = res.data.data;
      set((state) => {
        const exists = state.messages.some((m) => sameId(m._id, incoming._id));
        return exists ? state : { messages: [...state.messages, incoming] };
      });

      if (incoming) {
        useChatStore.getState().updateConversationLastMessage(conversationId, incoming);
      }

      return incoming;
    } catch (error) {
      console.error('Failed to send message:', error.stack || error);
      return null;
    }
  },

  subscribeToMessages: (currentConversationId) => {
    const socket = useSocketStore.getState().socket;
    if (!socket || !currentConversationId) return;

    if (messageHandler) {
      socket.off('newMessage', messageHandler);
    }

    messageHandler = (newMessage) => {
      if (!sameId(newMessage.conversationId, currentConversationId)) return;

      set((state) => {
        const exists = state.messages.some((m) => sameId(m._id, newMessage._id));
        return exists ? state : { messages: [...state.messages, newMessage] };
      });
    };

    socket.on('newMessage', messageHandler);
  },

  unsubscribeFromMessages: () => {
    const socket = useSocketStore.getState().socket;
    if (!socket || !messageHandler) return;
    socket.off('newMessage', messageHandler);
    messageHandler = null;
  },
}));
