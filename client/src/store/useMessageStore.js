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

// Change the parameters to accept 'image'
  sendMessage: async (conversationId, text, image, receiverId) => {
    set({ isSending: true }); 
    try {
      const token = await auth.currentUser.getIdToken();
      
      // ⚡ Include the image in the JSON payload
      const res = await api.post(`/messages/${conversationId}`, 
        { text, image, receiverId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      set({ messages: [...get().messages, res.data.data] });
      
      // Tell the sidebar to instantly update
      useChatStore.getState().updateSidebar(res.data.data);
      
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
