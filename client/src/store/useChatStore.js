import { create } from 'zustand';
import axios from 'axios';
import { auth } from '../lib/firebase';

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
  }
}));