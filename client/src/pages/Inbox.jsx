import { useState, useEffect } from 'react';
import { Search, Bell, MessageSquare, Plus, LogOut } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSocketStore } from '../store/useSocketStore';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';
import NewMessageModal from '../components/NewMessageModal';
import ChatPane from '../components/ChatPane';

export default function Inbox() {
  const navigate = useNavigate();
  const { conversationId } = useParams();
  
  // UI State
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  // Global Brains (Zustand)
  const { connect, disconnect, isConnected, socket } = useSocketStore();
  const { user, logout } = useAuthStore();
  const { 
    conversations, 
    fetchConversations, 
    isFetchingConversations,
    subscribeToPresence,      // <-- Extract this
    unsubscribeFromPresence   // <-- Extract this
  } = useChatStore();

  // Lifecycle: Connect Sockets
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  // Lifecycle: Hydrate Sidebar
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);
  // Lifecycle: Global Presence Listener (Waits for socket connection)
  useEffect(() => {
    if (!socket) return;
    
    subscribeToPresence();
    
    return () => unsubscribeFromPresence();
  }, [socket, subscribeToPresence, unsubscribeFromPresence]);
  
  // Algorithm: Secure Session Termination
  const handleLogout = async () => {
    disconnect(); // Sever the real-time WebSocket connection
    await logout(); // Destroy Firebase session & wipe Zustand memory bank
    // The <AuthGuard /> will instantly intercept the state change and route to /login
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[var(--bg-base)] text-[var(--text-primary)]">
      
      {/* TOPBAR */}
      <header className="h-12 border-b flex items-center justify-between px-6 z-40 sticky top-0 bg-[var(--bg-base)]" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-8">
          <h1 className="text-lg font-display font-bold">⚡ Zync</h1>
          
          <div className="relative group hidden sm:block">
            <Search className="w-4 h-4 absolute left-3 top-1.5 text-[var(--text-secondary)]" />
            <input 
              type="text" 
              placeholder="Search…  ⌘K" 
              className="w-60 h-8 bg-[var(--bg-surface)] border rounded-md pl-9 pr-3 text-sm focus:outline-none focus:border-[var(--accent-hover)] transition-all font-mono"
              style={{ borderColor: 'var(--border)' }}
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button className="text-[var(--text-secondary)] hover:text-white transition-colors">
            <Bell className="w-5 h-5" />
          </button>
          
          {/* Avatar & Profile Dropdown */}
          <div className="relative">
            <button 
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="w-8 h-8 rounded-full bg-[var(--border)] border-2 border-[var(--border-active)] overflow-hidden flex items-center justify-center font-display font-bold text-xs text-white hover:brightness-110 transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            >
              {user?.displayName?.charAt(0).toUpperCase() || 'Z'}
            </button>

            {/* Dropdown Menu Overlay */}
            {isProfileMenuOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setIsProfileMenuOpen(false)}
                ></div>
                
                <div 
                  className="absolute right-0 mt-2 w-48 bg-[var(--bg-surface)] border rounded-xl shadow-2xl py-1.5 z-50 overflow-hidden" 
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div className="px-4 py-2 border-b mb-1" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-sm font-medium text-white truncate">{user?.displayName}</p>
                    <p className="text-xs text-[var(--text-secondary)] font-mono truncate">@{user?.username}</p>
                  </div>
                  
                  <button 
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-[rgba(229,72,77,0.1)] transition-colors text-left"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* SIDEBAR (Conversation List) */}
        {/* Mobile (< md): Hide if conversationId exists | Desktop (>= md): Always visible */}
        <aside className={`border-r flex flex-col bg-[var(--bg-base)] z-10 transition-all duration-200 ${
          conversationId 
            ? 'hidden md:flex md:w-[280px]' 
            : 'w-full md:w-[280px] flex'
        }`} style={{ borderColor: 'var(--border)' }}>
          <div className="p-4">
            <button 
              onClick={() => setIsSearchModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 h-9 rounded-md text-sm font-medium transition-colors hover:brightness-110 active:scale-[0.98]" 
              style={{ backgroundColor: 'var(--accent)', color: 'white' }}
            >
              <Plus className="w-4 h-4" />
              New Message
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto px-2 mt-2 space-y-1">
            {isFetchingConversations && conversations.length === 0 && (
              <div className="flex justify-center mt-10">
                <div className="w-5 h-5 border-2 border-[var(--text-secondary)] border-t-[var(--accent)] rounded-full animate-spin"></div>
              </div>
            )}

            {!isFetchingConversations && conversations.length === 0 && (
              <div className="flex flex-col items-center text-center mt-10 px-4">
                <p className="text-sm text-[var(--text-secondary)]">No conversations yet.</p>
              </div>
            )}

            {conversations.map((conv) => {
              const isActive = conversationId === conv._id;
              
              return (
                <button
                  key={conv._id}
                  onClick={() => navigate(`/inbox/${conv._id}`)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all duration-200 text-left ${
                    isActive ? 'bg-[var(--bg-surface)] border-[var(--border)] shadow-sm' : 'hover:bg-[var(--bg-surface)] border-transparent'
                  } border`}
                >
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-[var(--border)] flex items-center justify-center font-display font-bold text-sm text-white">
                      {conv.otherUser.displayName.charAt(0).toUpperCase()}
                    </div>
                    {conv.otherUser.status?.online && (
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-[var(--success)] border-2 border-[var(--bg-base)] rounded-full"></div>
                    )}
                  </div>
                  
                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-white truncate">{conv.otherUser.displayName}</h4>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] font-mono truncate mt-0.5">
                      @{conv.otherUser.username}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* MAIN PANE (Dynamic Switcher) */}
        {conversationId ? (
          <ChatPane conversationId={conversationId} />
        ) : (
          <main className="flex-1 flex flex-col items-center justify-center bg-[var(--bg-base)]">
            <div className="flex flex-col items-center text-center max-w-[240px]">
              <MessageSquare className="w-12 h-12 text-[var(--text-secondary)] mb-6 opacity-50" />
              <h2 className="text-md font-semibold mb-2">Select a conversation</h2>
              <p className="text-sm text-[var(--text-secondary)]">or start a new one from the sidebar.</p>
              
              {/* Connectivity Status Indicator */}
              <div className="mt-8 flex items-center gap-2 text-xs font-mono text-[var(--text-secondary)]">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[var(--success)]' : 'bg-[var(--warning)] animate-pulse'}`} />
                {isConnected ? 'Socket Connected' : 'Reconnecting...'}
              </div>
            </div>
          </main>
        )}
      </div>

      {/* Modals */}
      <NewMessageModal 
        isOpen={isSearchModalOpen} 
        onClose={() => setIsSearchModalOpen(false)} 
      />
      
    </div>
  );
}