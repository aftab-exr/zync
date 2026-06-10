import { create } from 'zustand';
import { io } from 'socket.io-client';
import { auth } from '../lib/firebase.js';
import { useMessageStore } from './useMessageStore.js';

const SOCKET_URL = import.meta.env.MODE === "development" ? "http://localhost:4000" : "/";

export const useSocketStore = create((set, get) => ({
  socket: null,
  isConnected: false,

  connect: async () => {
    // 1. Prevent duplicate connections
    if (get().socket?.connected) return;

    // 2. Initialize the Socket.io Client with a DYNAMIC auth function
    // This guarantees we never send an expired token on auto-reconnect
    const socket = io(SOCKET_URL, {
      auth: async (cb) => {
        try {
          const currentUser = auth.currentUser;
          if (!currentUser) return cb({ token: null });
          
          // Firebase automatically refreshes the token if it is expired
          const token = await currentUser.getIdToken(); 
          cb({ token });
        } catch (error) {
          console.error('❌ Failed to fetch fresh socket token:', error);
          cb({ token: null });
        }
      }
    });

    // 3. Wire up the lifecycle events
    socket.on('connect', () => {
      if (import.meta.env.DEV) console.log('🟢 Socket connected to server:', socket.id);
      set({ isConnected: true });
    });

    socket.on('disconnect', () => {
      if (import.meta.env.DEV) console.log('🔴 Socket disconnected');
      set({ isConnected: false });
    });

    socket.on('connect_error', (err) => {
      console.error('❌ Socket connection error:', err.message);
    });

    // ⚡ Catch transient incoming server events and sync memory state
    socket.on("user_typing", ({ conversationId }) => {
      useMessageStore.getState().setTypingState(conversationId, true);
    });

    socket.on("user_stopped_typing", ({ conversationId }) => {
      useMessageStore.getState().setTypingState(conversationId, false);
    });

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, isConnected: false });
    }
  }
}));