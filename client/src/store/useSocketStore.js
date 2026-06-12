import { create } from 'zustand';
import { io } from 'socket.io-client';
import { auth } from '../lib/firebase.js';
import { useMessageStore } from './useMessageStore.js';
import { useChatStore } from './useChatStore.js';
import { sameId } from '../lib/conversation.js';

const SOCKET_URL = import.meta.env.MODE === 'development' ? 'http://localhost:4000' : '/';

export const useSocketStore = create((set, get) => ({
  socket: null,
  isConnected: false,
  isReconnecting: false,
  onlineUsers: [],

  connect: async () => {
    const { socket: existingSocket } = get();
    if (existingSocket) {
      if (existingSocket.connected) return;
      if (import.meta.env.DEV) console.log('🔄 Reconnecting existing socket...');
      set({ isReconnecting: true });
      existingSocket.connect();
      return;
    }

    if (import.meta.env.DEV) console.log('🔌 Creating new socket instance...');
    set({ isReconnecting: true });

    const socket = io(SOCKET_URL, {
      auth: async (cb) => {
        try {
          const currentUser = auth.currentUser;
          if (!currentUser) return cb({ token: null });
          const token = await currentUser.getIdToken();
          cb({ token });
        } catch (error) {
          console.error('Failed to fetch socket token:', error.stack || error);
          cb({ token: null });
        }
      },
    });

    socket.on('connect', () => {
      if (import.meta.env.DEV) console.log('🟢 Socket connected to server:', socket.id);
      set({ isConnected: true, isReconnecting: false });
    });

    socket.on('disconnect', (reason) => {
      if (import.meta.env.DEV) console.log('🔴 Socket disconnected. Reason:', reason);
      set({ isConnected: false, isReconnecting: reason !== 'io client disconnect' });
      // If server disconnected, manually reconnect
      if (reason === 'io server disconnect') {
        socket.connect();
      }
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
      set({ isConnected: false, isReconnecting: socket.active });
    });

    // Bind reconnection events from socket.io manager
    socket.io.on('reconnect_attempt', (attempt) => {
      if (import.meta.env.DEV) console.log('🔄 Socket reconnect attempt:', attempt);
      set({ isReconnecting: true });
    });

    socket.io.on('reconnect', () => {
      if (import.meta.env.DEV) console.log('🟢 Socket reconnected successfully');
      set({ isConnected: true, isReconnecting: false });
    });

    socket.io.on('reconnect_failed', () => {
      if (import.meta.env.DEV) console.log('❌ Socket reconnect failed');
      set({ isConnected: false, isReconnecting: false });
    });

    socket.on('presence:update', ({ userId, online }) => {
      const id = userId?.toString();
      if (!id) return;

      set((state) => {
        const next = new Set(state.onlineUsers.map(String));
        if (online) next.add(id);
        else next.delete(id);
        return { onlineUsers: Array.from(next) };
      });
    });

    socket.on('user_typing', ({ conversationId }) => {
      useMessageStore.getState().setTypingState(conversationId, true);
    });

    socket.on('user_stopped_typing', ({ conversationId }) => {
      useMessageStore.getState().setTypingState(conversationId, false);
    });

    socket.on('newMessage', (newMessage) => {
      useChatStore.getState().updateConversationLastMessage(newMessage.conversationId, newMessage);

      const selectedConversation = useChatStore.getState().selectedConversation;
      if (selectedConversation && sameId(selectedConversation._id, newMessage.conversationId)) {
        useMessageStore.setState((state) => {
          const exists = state.messages.some((m) => sameId(m._id, newMessage._id));
          return exists ? state : { messages: [...state.messages, newMessage] };
        });
      }
    });

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.off('presence:update');
      socket.off('user_typing');
      socket.off('user_stopped_typing');
      socket.off('newMessage');
      // Clean up manager events
      socket.io.off('reconnect_attempt');
      socket.io.off('reconnect');
      socket.io.off('reconnect_failed');
      socket.disconnect();
      set({ socket: null, isConnected: false, isReconnecting: false, onlineUsers: [] });
    }
  },
}));
