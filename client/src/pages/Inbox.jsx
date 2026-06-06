import { useState, useEffect } from 'react';
import { Search, Bell, MessageSquare, Plus } from 'lucide-react';
import { useSocketStore } from '../store/useSocketStore';
import { useAuthStore } from '../store/useAuthStore';
import NewMessageModal from '../components/NewMessageModal';

export default function Inbox() {
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const { connect, disconnect, isConnected } = useSocketStore();
  const user = useAuthStore((state) => state.user);

  // Initialize the real-time engine when the Inbox mounts
  useEffect(() => {
    connect();
    return () => disconnect(); // Cleanup and close socket on unmount
  }, [connect, disconnect]);

  return (
    <div className="flex flex-col h-screen w-full bg-[var(--bg-base)] text-[var(--text-primary)]">
      
      {/* TOPBAR */}
      <header className="h-12 border-b flex items-center justify-between px-6 z-50 sticky top-0 bg-[var(--bg-base)]" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-8">
          <h1 className="text-lg font-display font-bold">⚡ Zync</h1>
          
          {/* Search Bar */}
          <div className="relative group">
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
          
          {/* Avatar Dropdown Placeholder */}
          <div className="w-8 h-8 rounded-full bg-[var(--border)] border-2 border-[var(--border-active)] overflow-hidden flex items-center justify-center font-display font-bold text-xs">
            {user?.displayName?.charAt(0).toUpperCase() || 'Z'}
          </div>
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* SIDEBAR (Conversation List) */}
        <aside className="w-[280px] border-r flex flex-col bg-[var(--bg-base)] z-10" style={{ borderColor: 'var(--border)' }}>
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
          
          <div className="flex-1 overflow-y-auto px-2">
            {/* V1 Empty State Skeleton */}
            <div className="flex flex-col items-center text-center mt-10 px-4">
              <p className="text-sm text-[var(--text-secondary)]">No conversations yet.</p>
            </div>
          </div>
        </aside>

        {/* MAIN PANE (Active Conversation / Empty State) */}
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
        
      </div>

      {/* Global Modals */}
      <NewMessageModal 
        isOpen={isSearchModalOpen} 
        onClose={() => setIsSearchModalOpen(false)} 
      />
      
    </div>
  );
}