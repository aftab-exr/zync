import { create } from 'zustand';
import { api } from '../lib/axios';
import { auth } from '../lib/firebase';
import { useSocketStore } from './useSocketStore';
import { useAuthStore } from './useAuthStore';

const sameId = (a, b) => a?.toString() === b?.toString();

function normalizeConversation(conv) {
  if (!conv || conv.otherUser) return conv;

  const currentUserId = useAuthStore.getState().user?._id;

  if (conv.isGroup) {
    return {
      ...conv,
      otherUser: {
        _id: conv._id,
        displayName: conv.groupName || 'Group Chat',
        username: `${conv.participants?.length ?? 0} members`,
        isAI: false,
        status: { online: false },
      },
    };
  }

  if (!currentUserId) return conv;

  const otherUser = conv.participants?.find((p) => !sameId(p._id, currentUserId));
  return otherUser ? { ...conv, otherUser } : conv;
}

function normalizeConversations(conversations) {
  return conversations.map(normalizeConversation).filter((conv) => conv.otherUser);
}

export const useChatStore = create((set) => ({
  conversations: [],
  isFetchingConversations: false,
  isCreatingGroup: false,

  fetchConversations: async () => {
    set({ isFetchingConversations: true });
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await api.get('/conversations', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      set({ conversations: normalizeConversations(response.data.data) });
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
          if (sameId(conv.otherUser?._id, userId)) {
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
  },

  createConversation: async (receiverId) => {
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await api.post(
        '/conversations',
        { receiverId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const conversation = normalizeConversation(res.data.data);
      if (!conversation?.otherUser) return null;

      set((state) => {
        const exists = state.conversations.some((c) => c._id === conversation._id);
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
      const token = await auth.currentUser.getIdToken();
      const res = await api.post("/conversations/group", 
        { name, participantIds },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const group = normalizeConversation(res.data.data);
      if (!group?.otherUser) return null;

      set((state) => ({
        conversations: [group, ...state.conversations],
      }));

      return group;
    } catch (error) {
      console.error("Failed to create group:", error);
      return null;
    } finally {
      set({ isCreatingGroup: false });
    }
  },
}));