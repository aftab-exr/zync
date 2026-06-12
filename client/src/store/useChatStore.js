import { create } from 'zustand';
import { api } from '../lib/axios';
import { auth } from '../lib/firebase';
import { useSocketStore } from './useSocketStore';
import { sameId } from '../lib/conversation';

let presenceHandler = null;

export const useChatStore = create((set) => ({
  conversations: [],
  selectedConversation: null,
  isFetchingConversations: false,
  isCreatingGroup: false,

  setSelectedConversation: (conversation) => set({ selectedConversation: conversation }),

  getConversations: async () => {
    set({ isFetchingConversations: true });
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      const response = await api.get('/conversations', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const conversations = response.data.data;
      set({ conversations });

      const onlineIds = conversations.flatMap((conv) =>
        (conv.participants || [])
          .filter((p) => p.status?.online)
          .map((p) => p._id.toString())
      );
      if (onlineIds.length > 0) {
        useSocketStore.setState((state) => ({
          onlineUsers: Array.from(new Set([...state.onlineUsers, ...onlineIds])),
        }));
      }
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    } finally {
      set({ isFetchingConversations: false });
    }
  },

  createConversation: async (receiverId) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await api.post(
        '/conversations',
        { receiverId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const conversation = res.data.data;
      set((state) => {
        const exists = state.conversations.some((c) => sameId(c._id, conversation._id));
        if (exists) return state;
        return { conversations: [conversation, ...state.conversations] };
      });

      return conversation;
    } catch (error) {
      console.error('Failed to create conversation:', error);
      return null;
    }
  },

  createGroup: async (name, participantIds) => {
    set({ isCreatingGroup: true });
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await api.post(
        '/conversations/group',
        { name, participantIds },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const group = res.data.data;
      set((state) => {
        const exists = state.conversations.some((c) => sameId(c._id, group._id));
        if (exists) return state;
        return { conversations: [group, ...state.conversations] };
      });

      return group;
    } catch (error) {
      console.error('Failed to create group:', error);
      return null;
    } finally {
      set({ isCreatingGroup: false });
    }
  },

  subscribeToPresence: () => {
    const socket = useSocketStore.getState().socket;
    if (!socket) return;

    if (presenceHandler) socket.off('presence:update', presenceHandler);

    presenceHandler = ({ userId, online, lastSeen }) => {
      set((state) => ({
        conversations: state.conversations.map((conv) => ({
          ...conv,
          participants: conv.participants?.map((p) =>
            sameId(p._id, userId)
              ? { ...p, status: { online, lastSeen } }
              : p
          ),
        })),
      }));
    };

    socket.on('presence:update', presenceHandler);
  },

  unsubscribeFromPresence: () => {
    const socket = useSocketStore.getState().socket;
    if (!socket || !presenceHandler) return;
    socket.off('presence:update', presenceHandler);
    presenceHandler = null;
  },

  updateConversationLastMessage: (conversationId, message) => {
    set((state) => {
      let conversationFound = false;
      const updatedConversations = state.conversations.map((conv) => {
        if (sameId(conv._id, conversationId)) {
          conversationFound = true;
          return {
            ...conv,
            lastMessageId: message,
            lastMessageAt: message.createdAt || new Date().toISOString(),
          };
        }
        return conv;
      });

      if (!conversationFound) {
        setTimeout(() => {
          useChatStore.getState().getConversations();
        }, 100);
        return state;
      }

      const sortedConversations = [...updatedConversations].sort((a, b) => {
        const dateA = a.lastMessageAt ? new Date(a.lastMessageAt) : new Date(0);
        const dateB = b.lastMessageAt ? new Date(b.lastMessageAt) : new Date(0);
        return dateB - dateA;
      });

      return { conversations: sortedConversations };
    });
  },
}));
