import { create } from 'zustand';
import axios from 'axios';
import { auth } from '../lib/firebase';
import { useSocketStore } from './useSocketStore'; // ⚡ NEW: Need socket access

export const useChatStore = create((set) => ({
  conversations: [],
  isFetchingConversations: false,

  fetchConversations: async () => {
    set({ isFetchingConversations: true });
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await axios.get('http://localhost:4000/api/v1/conversations', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      set({ conversations: response.data.data });
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
    } finally {
      set({ isFetchingConversations: false });
    }
  },

  // Algorithm: Global Presence Listener
  subscribeToPresence: () => {
    const socket = useSocketStore.getState().socket;
    if (!socket) return;

    socket.on("presence:update", ({ userId, online, lastSeen }) => {
      // ⚡ Update the specific user's status across ALL loaded conversations
      set((state) => ({
        conversations: state.conversations.map((conv) => {
          if (conv.otherUser._id === userId) {
            return {
              ...conv,
              otherUser: {
                ...conv.otherUser,
                status: { online, lastSeen }
              }
            };
          }
          return conv;
        })
      }));
    });
  },

  unsubscribeFromPresence: () => {
    const socket = useSocketStore.getState().socket;
    if (!socket) return;
    socket.off("presence:update");
  }
}));