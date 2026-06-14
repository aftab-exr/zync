import { create } from 'zustand';
import { api } from '../lib/axios';
import { auth } from '../lib/firebase';
import { useSocketStore } from './useSocketStore';
import { useAuthStore } from './useAuthStore';
import { sameId } from '../lib/conversation';
import {
  generateGroupSymmetricKey,
  exportSymmetricKey,
  importPrivateKey,
  importPublicKey,
  deriveSharedSecret,
  encryptText,
} from '../lib/crypto';

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
      if (!token) {
        throw new Error('No active session token found');
      }

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
      console.error('Failed to fetch conversations:', error.stack || error);
    } finally {
      set({ isFetchingConversations: false });
    }
  },

  createConversation: async (receiverId) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error('No active session token found');
      }
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
      console.error('Failed to create conversation:', error.stack || error);
      return null;
    }
  },

  // ⚡ VECTOR 2: `participants` are full user objects (with _id + publicKey from
  // /users/search). We wrap a fresh AES group key for every member before posting.
  createGroup: async (name, participants) => {
    set({ isCreatingGroup: true });
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error('No active session token found');
      }

      const participantIds = (participants || []).map((p) => p._id);

      // ⚡ VECTOR 2: Multi-Cast Zero-Knowledge group key wrapping.
      // Generate one master AES key, then lock it for each member (incl. creator)
      // using ECDH(creatorPrivate, memberPublic). Failure here degrades gracefully
      // to a legacy plaintext group rather than blocking creation.
      let encryptedGroupKeys = [];
      try {
        const currentUser = useAuthStore.getState().authUser || useAuthStore.getState().user;
        const privateKeyJwk = localStorage.getItem('zync_private_key');

        if (currentUser?._id && currentUser?.publicKey && privateKeyJwk) {
          const groupKey = await generateGroupSymmetricKey();
          const rawGroupKeyStr = await exportSymmetricKey(groupKey);
          const creatorPriv = await importPrivateKey(privateKeyJwk);

          // Include the creator's own key entry so they can decrypt their own group.
          const allMembers = [
            ...participants,
            { _id: currentUser._id, publicKey: currentUser.publicKey },
          ];

          for (const member of allMembers) {
            if (!member?._id || !member?.publicKey) continue;
            try {
              const memberPub = await importPublicKey(member.publicKey);
              const wrapSecret = await deriveSharedSecret(creatorPriv, memberPub);
              const encryptedKeyPayload = await encryptText(rawGroupKeyStr, wrapSecret);
              encryptedGroupKeys.push({
                userId: member._id,
                encryptedKeyPayload: JSON.stringify(encryptedKeyPayload),
              });
            } catch (memberErr) {
              console.error(`Failed to wrap group key for member ${member._id}:`, memberErr);
            }
          }
        }
      } catch (keyErr) {
        console.error('Group key generation failed; falling back to plaintext group:', keyErr);
        encryptedGroupKeys = [];
      }

      const res = await api.post(
        '/conversations/group',
        { name, participantIds, encryptedGroupKeys },
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
      console.error('Failed to create group:', error.stack || error);
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
