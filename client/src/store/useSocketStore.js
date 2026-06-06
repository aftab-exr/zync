import { create } from 'zustand';
import { io } from 'socket.io-client';
import { auth } from '../lib/firebase.js';

const SOCKET_URL = 'http://localhost:4000';

export const useSocketStore = create((set, get) => ({
  socket: null,
  isConnected: false,

  connect: async () => {
    // 1. Prevent duplicate connections
    if (get().socket?.connected) return;

    // 2. Fetch the cryptographic JWT for the handshake
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    const token = await currentUser.getIdToken();

    // 3. Initialize the Socket.io Client
    const socket = io(SOCKET_URL, {
      auth: { token }
    });

    // 4. Wire up the lifecycle events
    socket.on('connect', () => {
      console.log('🟢 Socket connected to server:', socket.id);
      set({ isConnected: true });
    });

    socket.on('disconnect', () => {
      console.log('🔴 Socket disconnected');
      set({ isConnected: false });
    });

    socket.on('connect_error', (err) => {
      console.error('❌ Socket connection error:', err.message);
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