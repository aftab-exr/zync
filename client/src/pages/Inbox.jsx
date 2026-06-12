import { useState, useEffect } from 'react';
import { Search, Bell, MessageSquare, Plus, LogOut, Users } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSocketStore } from '../store/useSocketStore';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';
import NewMessageModal from '../components/NewMessageModal';
import ChatPane from '../components/ChatPane';

export default function Inbox() {
  const navigate = useNavigate();
  const { conversationId } = useParams();
  
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  const { connect, disconnect, isConnected, socket } = useSocketStore();
  const { user, authUser, logout } = useAuthStore();
  const currentUser = authUser || user; 

  const { 
    conversations, 
    fetchConversations, // ⚡ Aligned with your store
    isFetchingConversations,
    subscribeToPresence,      
    unsubscribeFromPresence
  } = useChatStore();

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  useEffect(() => {
    if (!currentUser?._id) return;
    if (fetchConversations) fetchConversations();
  }, [fetchConversations, currentUser?._id]);

  useEffect(() => {
    if (!socket) return;
    if (subscribeToPresence) subscribeToPresence();
    
    return () => {
      if (unsubscribeFromPresence) unsubscribeFromPresence();
    };
  }, [socket, subscribeToPresence, unsubscribeFromPresence]);
  
  const handleLogout = async () => {
    disconnect();
    await logout();
  };

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-[var(--bg-base)] text-[var(--text-primary)]">
      
      {/* ⚡ TOPBAR */}
      <header className="h-12 border-b flex items-center justify-between px-6 z-40 sticky top-0 bg-[var(--bg-base)]" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-8">
          <h1 className="text-lg font-display font-bold">⚡ Zync</h1>
          <div className="relative group hidden sm:block">
            <Search className="w-4 h-4 absolute left-3 top-1.5 text-[var(--text-secondary)]" />
            <input type="text" placeholder="Search…  ⌘K" className="w-60 h-8 bg-[var(--bg-surface)] border rounded-md pl-9 pr-3 text-sm focus:outline-none focus:border-[var(--accent-hover)] transition-all font-mono" style={{ borderColor: 'var(--border)' }} />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button className="text-[var(--text-secondary)] hover:text-white transition-all p-2 hover:bg-[var(--bg-surface)] rounded-lg">
            <Bell className="w-5 h-5" />
          </button>
          <div className="relative">
            <button onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)} className="w-10 h-10 rounded-full bg-[var(--border)] border-2 border-[var(--border-active)] overflow-hidden flex items-center justify-center font-display font-bold text-xs text-white hover:brightness-110 transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
              {currentUser?.displayName?.charAt(0).toUpperCase() || 'Z'}
            </button>
            {isProfileMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsProfileMenuOpen(false)}></div>
                <div className="absolute right-0 mt-2 w-48 bg-[var(--bg-surface)] border rounded-xl shadow-2xl py-1.5 z-50 overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                  <div className="px-4 py-2 border-b mb-1" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-sm font-medium text-white truncate">{currentUser?.displayName}</p>
                    <p className="text-xs text-[var(--text-secondary)] font-mono truncate">@{currentUser?.username}</p>
                  </div>
                  <button onClick={handleLogout} className="w-full flex items-center gap-2 px-4 py-3 text-sm text-[var(--error)] hover:bg-[var(--bg-raised)] transition-all text-left active:scale-95">
                    <LogOut className="w-4 h-4" /> Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ⚡ MAIN LAYOUT */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* SIDEBAR */}
        <aside className={`border-r flex flex-col bg-[var(--bg-base)] z-10 overflow-hidden ${conversationId ? 'hidden md:flex md:w-80' : 'w-full md:w-80 flex'}`} style={{ borderColor: 'var(--border)' }}>
          <div className="p-4">
            <button onClick={() => setIsSearchModalOpen(true)} className="w-full flex items-center justify-center gap-2 h-12 rounded-lg text-sm font-medium transition-all hover:brightness-110 active:scale-95" style={{ backgroundColor: 'var(--accent)', color: 'white' }}>
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New Message</span> <span className="sm:hidden">New</span>
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto px-2 mt-2 space-y-1 overflow-x-hidden">
            {isFetchingConversations && conversations.length === 0 && (
              <div className="flex justify-center mt-10"><div className="w-5 h-5 border-2 border-[var(--text-secondary)] border-t-[var(--accent)] rounded-full animate-spin"></div></div>
            )}

            {!isFetchingConversations && conversations.length === 0 && (
              <div className="flex flex-col items-center text-center mt-10 px-4"><p className="text-sm text-[var(--text-secondary)]">No conversations yet.</p></div>
            )}

            {conversations.map((conv, index) => {
              const isActive = conversationId === conv._id;
              
              // Utilizing your store's normalized "otherUser" object!
              const displayName = conv.otherUser?.displayName || "Unknown";
              const isOnline = conv.otherUser?.status?.online || false;
              const lastMsgText = conv.lastMessageId?.text || "Started a new conversation";

              return (
                /* ⚡ THE FIX: motion.div handles physics, standard <button> handles clicks! */
                <motion.div
                  key={conv._id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.04, type: "spring", stiffness: 300, damping: 30 }}
                >
                  <button
                    onClick={() => navigate(`/inbox/${conv._id}`)}
                    className={`w-full flex items-center gap-3 p-3 sm:p-4 rounded-lg transition-all duration-200 ease-in-out text-left min-h-[56px] sm:min-h-[48px] active:scale-95 ${
                      isActive ? 'bg-[var(--bg-surface)] border-[var(--border)] shadow-sm' : 'hover:bg-[var(--bg-surface)] border-transparent hover:transition-colors'
                    } border`}
                  >
                    <div className="relative flex-shrink-0">
                      {conv.isGroup ? (
                        <div className="w-10 h-10 rounded-full bg-[var(--accent-dim)] text-[var(--accent)] flex items-center justify-center">
                          <Users className="w-5 h-5" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[var(--border)] flex items-center justify-center font-display font-bold text-sm text-white">
                          {displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      {!conv.isGroup && isOnline && (
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-[var(--success)] border-2 border-[var(--bg-base)] rounded-full"></div>
                      )}
                    </div>
                    
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-white truncate">{displayName}</h4>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] font-mono truncate mt-0.5">
                        {lastMsgText}
                      </p>
                    </div>
                  </button>
                </motion.div>
              );
            })}
          </div>
        </aside>

        {/* MAIN PANE */}
        {conversationId ? (
          <ChatPane conversationId={conversationId} />
        ) : (
          <main className="flex-1 flex flex-col items-center justify-center bg-[var(--bg-base)]">
            <div className="flex flex-col items-center text-center max-w-[240px]">
              <MessageSquare className="w-12 h-12 text-[var(--text-secondary)] mb-6 opacity-50" />
              <h2 className="text-md font-semibold mb-2">Select a conversation</h2>
              <p className="text-sm text-[var(--text-secondary)]">or start a new one from the sidebar.</p>
              
              <div className="mt-8 flex items-center gap-2 text-xs font-mono text-[var(--text-secondary)]">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[var(--success)]' : 'bg-[var(--warning)] animate-pulse'}`} />
                {isConnected ? 'Socket Connected' : 'Reconnecting...'}
              </div>
            </div>
          </main>
        )}
      </div>

      <NewMessageModal 
        isOpen={isSearchModalOpen} 
        onClose={() => setIsSearchModalOpen(false)} 
        onSelectConversation={(id) => {
          navigate(`/inbox/${id}`);
          setIsSearchModalOpen(false);
        }} 
      />
      
    </div>
  );
}