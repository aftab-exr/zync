import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, Edit, Users, LogOut, MessageSquare } from 'lucide-react';
import { useChatStore } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';
import { useSocketStore } from '../store/useSocketStore';
import ChatPane from '../components/ChatPane';
import NewMessageModal from '../components/NewMessageModal';
import {
  sameId,
  getOtherParticipant,
  isUserOnline,
  getLastMessagePreview,
} from '../lib/conversation';

export default function Inbox() {
  const navigate = useNavigate();
  const { conversationId } = useParams();

  const {
    conversations,
    getConversations,
    selectedConversation,
    setSelectedConversation,
    isFetchingConversations,
    subscribeToPresence,
    unsubscribeFromPresence,
  } = useChatStore();
  const { user, logout } = useAuthStore();
  const { onlineUsers, connect, disconnect, isConnected, isReconnecting } = useSocketStore();

  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  useEffect(() => {
    if (!isConnected) return;
    subscribeToPresence();
    return () => unsubscribeFromPresence();
  }, [isConnected, subscribeToPresence, unsubscribeFromPresence]);

  useEffect(() => {
    if (!user?._id) return;
    getConversations();
  }, [getConversations, user?._id]);

  useEffect(() => {
    if (!conversationId) {
      setSelectedConversation(null);
      return;
    }

    const conv = conversations.find((c) => sameId(c._id, conversationId));
    if (conv) setSelectedConversation(conv);
  }, [conversationId, conversations, setSelectedConversation]);

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return conversations;

    return conversations.filter((c) => {
      if (c.isGroup) {
        return c.groupName?.toLowerCase().includes(query);
      }

      const otherUser = getOtherParticipant(c.participants, user?._id);
      return (
        otherUser?.displayName?.toLowerCase().includes(query) ||
        otherUser?.username?.toLowerCase().includes(query)
      );
    });
  }, [conversations, search, user?._id]);

  const openConversation = (conv) => {
    setSelectedConversation(conv);
    navigate(`/inbox/${conv._id}`);
  };

  const handleConversationCreated = async (id) => {
    await getConversations();
    const conv = useChatStore.getState().conversations.find((c) => sameId(c._id, id));
    if (conv) openConversation(conv);
  };

  return (
    <div className="flex h-screen bg-[#0D0D0F] text-white overflow-hidden">
      <div
        className={`w-full md:w-[320px] lg:w-[380px] flex flex-col border-r border-[var(--border)] bg-[#141417] ${
          selectedConversation ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div className="h-16 px-4 flex items-center justify-between border-b border-[var(--border)] bg-[#0D0D0F]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[var(--border)] overflow-hidden">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-bold text-sm bg-[var(--accent)] text-white">
                  {user?.displayName?.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex flex-col">
              <span className="font-display font-bold text-base leading-tight">Zync</span>
              {!isConnected && isReconnecting && (
                <span className="text-[10px] text-[var(--warning,#F59E0B)] font-medium animate-pulse flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning,#F59E0B)]" />
                  Reconnecting...
                </span>
              )}
              {!isConnected && !isReconnecting && (
                <span className="text-[10px] text-[var(--error,#EF4444)] font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--error,#EF4444)]" />
                  Disconnected
                </span>
              )}
              {isConnected && (
                <span className="text-[10px] text-[var(--success,#10B981)] font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--success,#10B981)] animate-pulse" />
                  Connected
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowModal(true)}
              className="p-2 text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-raised)] rounded-full transition-colors"
              aria-label="New message"
            >
              <Edit className="w-5 h-5" />
            </button>
            <button
              onClick={logout}
              className="p-2 text-[var(--text-secondary)] hover:text-[var(--error)] hover:bg-[var(--bg-raised)] rounded-full transition-colors"
              aria-label="Sign out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[var(--bg-base)] border border-[var(--border)] rounded-xl py-2.5 pl-9 pr-4 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isFetchingConversations && conversations.length === 0 ? (
            <div className="flex justify-center p-8">
              <div className="w-5 h-5 border-2 border-[var(--text-secondary)] border-t-[var(--accent)] rounded-full animate-spin" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-[var(--text-secondary)] text-sm">
              No conversations found.
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isGroup = conv.isGroup;
              const otherUser = isGroup ? null : getOtherParticipant(conv.participants, user?._id);
              const displayName = isGroup
                ? conv.groupName || 'Group Chat'
                : otherUser?.displayName || otherUser?.username || 'Unknown';
              const isSelected = sameId(selectedConversation?._id, conv._id);
              const isOnline = otherUser
                ? isUserOnline(otherUser._id, onlineUsers, otherUser.status)
                : false;

              return (
                <button
                  key={conv._id}
                  onClick={() => openConversation(conv)}
                  className={`w-full p-4 flex items-center gap-3 hover:bg-[var(--bg-raised)] transition-colors border-l-2 ${
                    isSelected
                      ? 'bg-[var(--bg-raised)] border-[var(--accent)]'
                      : 'border-transparent'
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    {isGroup ? (
                      <div className="w-12 h-12 rounded-full bg-[var(--accent-dim)] text-[var(--accent)] flex items-center justify-center">
                        <Users className="w-6 h-6" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-[var(--border)] flex items-center justify-center font-bold text-lg text-white overflow-hidden">
                        {otherUser?.avatarUrl ? (
                          <img src={otherUser.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          displayName.charAt(0).toUpperCase()
                        )}
                      </div>
                    )}
                    {!isGroup && isOnline && (
                      <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-[var(--success)] border-2 border-[var(--bg-surface)] rounded-full" />
                    )}
                  </div>

                  <div className="flex-1 text-left min-w-0">
                    <h3 className="text-[15px] font-medium text-white truncate">{displayName}</h3>
                    <p className="text-sm text-[var(--text-secondary)] truncate">
                      {getLastMessagePreview(conv)}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className={`flex-1 flex flex-col ${!selectedConversation ? 'hidden md:flex' : 'flex'}`}>
        {selectedConversation ? (
          <ChatPane />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[var(--bg-base)]">
            <div className="w-16 h-16 rounded-full bg-[var(--bg-raised)] flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8 text-[var(--text-secondary)]" />
            </div>
            <h2 className="text-xl font-display font-semibold mb-2">Zync for Web</h2>
            <p className="text-[var(--text-secondary)] max-w-sm">
              Select a conversation from the sidebar or start a new message to begin chatting.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-6 px-6 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-medium transition-colors"
            >
              Start Chatting
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <NewMessageModal
          onClose={() => setShowModal(false)}
          onSelectConversation={handleConversationCreated}
        />
      )}
    </div>
  );
}
