import { create } from 'zustand';
import axios from 'axios';
import { auth } from '../lib/firebase';
import { useSocketStore } from './useSocketStore';

export const useMessageStore = create((set, get) => ({
  messages: [],
  isFetching: false,

  fetchMessages: async (conversationId) => {
    set({ isFetching: true });
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await axios.get(`http://localhost:4000/api/v1/messages/${conversationId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      set({ messages: res.data.data });
    } catch (error) {
      console.error("Failed to fetch messages:", error);
    } finally {
      set({ isFetching: false });
    }
  },

  sendMessage: async (conversationId, text, receiverId) => {
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await axios.post(`http://localhost:4000/api/v1/messages/${conversationId}`, 
        { text, receiverId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Optimistically append the message to the UI instantly
      set({ messages: [...get().messages, res.data.data] });
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  },

  // Algorithm: The Real-Time Listener
  subscribeToMessages: (currentConversationId) => {
    const socket = useSocketStore.getState().socket;
    if (!socket) return;

    socket.on("newMessage", (newMessage) => {
      // Security Check: Only append if the incoming message belongs to the room we are actively looking at
      if (newMessage.conversationId === currentConversationId) {
        set({ messages: [...get().messages, newMessage] });
      }
    });
  },

  unsubscribeFromMessages: () => {
    const socket = useSocketStore.getState().socket;
    if (!socket) return;
    socket.off("newMessage");
  }
}));