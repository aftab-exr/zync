import AISidecar from '../components/AISidecar';
import { useCallStore } from '../store/useCallStore';
import { lazy, Suspense } from 'react';
import { InboxSkeleton } from '../components/Skeletons';
import ConnectionStatus from '../components/ConnectionStatus';

const CallOverlay = lazy(() => import('../components/CallOverlay'));
import { useState, useEffect, useMemo } from 'react';
import { Search, Bell, Plus, Users } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSocketStore } from '../store/useSocketStore';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';
import NewMessageModal from '../components/NewMessageModal';
import ChatPane from '../components/ChatPane';
import AvatarDropdown from '../components/AvatarDropdown';
import EmptyChatState from '../components/EmptyChatState';

export default function Inbox() {
  const navigate = useNavigate();
  const { conversationId } = useParams();
  
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  const { connect, disconnect, socket } = useSocketStore();
  const { user, authUser } = useAuthStore();
  const { callState } = useCallStore();
  const currentUser = authUser || user;

  const { 
    conversations, 
    getConversations, // FIXED: Was fetchConversations
    isFetchingConversations,
    subscribeToPresence,      
    unsubscribeFromPresence
  } = useChatStore();

  useEffect(() => {
    connect();
    useCallStore.getState().initCallListeners();
    return () => disconnect();
  }, [connect, disconnect]);

  useEffect(() => {
    if (!currentUser?._id) return;
    if (getConversations) getConversations();
  }, [getConversations, currentUser?._id]);

  useEffect(() => {
    if (!socket) return;
    if (subscribeToPresence) subscribeToPresence();
    
    return () => {
      if (unsubscribeFromPresence) unsubscribeFromPresence();
    };
  }, [socket, subscribeToPresence, unsubscribeFromPresence]);
  
  const processedConversations = useMemo(() => {
    return conversations.map((conv) => {
      const otherParticipant = conv.participants?.find(p => p._id !== currentUser?._id);
      const displayUser = conv.otherUser || otherParticipant;
      const displayName = conv.isGroup ? (conv.groupName || "Group") : (displayUser?.displayName || "Unknown");
      const isOnline = displayUser?.status?.online || false;
      const rawText = conv.lastMessageId?.text;
      const lastMsgText = rawText?.startsWith('{"iv":') ? "🔒 Encrypted Message" : (rawText || "Started a new conversation");
      return {
        ...conv,
        displayName,
        isOnline,
        lastMsgText,
      };
    });
  }, [conversations, currentUser?._id]);

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-base text-tx-primary">
      
      {/* Top navigation bar */}
      <header className="h-14 border-b-3 border-border flex items-center justify-between px-6 z-40 sticky top-0 bg-base">
        <div className="flex items-center gap-8">
          <h1 className="text-xl font-display font-bold">Zync</h1>
          <div className="relative group hidden sm:block">
            <Search className="w-4 h-4 absolute left-3 top-2 text-tx-secondary" />
            <input type="text" placeholder="Search…  ⌘K" className="w-60 h-9 bg-surface border-3 border-border rounded-sm pl-9 pr-3 text-sm focus:outline-none focus:border-accent transition-colors font-mono shadow-brutal-sm" />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button className="text-tx-secondary hover:text-tx-primary transition-colors p-2 hover:bg-surface border-3 border-transparent hover:border-border rounded-sm">
            <Bell className="w-5 h-5" />
          </button>
          <AvatarDropdown avatarUrl={currentUser?.avatarUrl} />
        </div>
      </header>

      <ConnectionStatus />

      {/* Main inbox layout */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Sidebar */}
        <aside className={`border-r-3 border-border flex flex-col bg-base z-10 overflow-hidden ${conversationId ? 'hidden md:flex md:w-80' : 'w-full md:w-80 flex'}`}>
          <div className="p-4">
            <button onClick={() => setIsSearchModalOpen(true)} className="w-full flex items-center justify-center gap-2 h-12 bg-accent text-tx-inverse border-3 border-border rounded-sm shadow-brutal-sm font-bold transition-all active:translate-y-1 active:translate-x-1 active:shadow-none hover:bg-accent">
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New Message</span> <span className="sm:hidden">New</span>
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto px-2 mt-2 space-y-1 overflow-x-hidden">
            {isFetchingConversations && conversations.length === 0 && (
              <InboxSkeleton />
            )}

            {!isFetchingConversations && conversations.length === 0 && (
              <div className="flex flex-col items-center text-center mt-10 px-4"><p className="text-sm text-tx-secondary">No conversations yet.</p></div>
            )}

            {processedConversations.map((conv, index) => {
              const isActive = conversationId === conv._id;

              return (
                /* Separate physics wrapper from clickable element */
                <motion.div
                  key={conv._id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.04, type: "spring", stiffness: 300, damping: 30 }}
                >
                  <button
                    onClick={() => navigate(`/inbox/${conv._id}`)}
                    className={`w-full flex items-center gap-3 p-3 sm:p-4 rounded-sm transition-all duration-200 ease-in-out text-left min-h-[56px] sm:min-h-[48px] active:translate-y-[2px] ${
                      isActive ? 'bg-surface border-3 border-border shadow-brutal-sm' : 'hover:bg-surface border-3 border-transparent hover:border-border hover:shadow-brutal-sm'
                    }`}
                  >
                    <div className="relative flex-shrink-0">
                      {conv.isGroup ? (
                        <div className="w-10 h-10 rounded-sm border-2 border-border bg-primary text-tx-primary flex items-center justify-center">
                          <Users className="w-5 h-5" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-sm border-2 border-border bg-border flex items-center justify-center font-display font-bold text-sm text-tx-inverse">
                          {conv.displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      {!conv.isGroup && conv.isOnline && (
                        <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-success border-2 border-border rounded-full"></div>
                      )}
                    </div>
                    
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-tx-primary truncate">{conv.displayName}</h4>
                      </div>
                      <p className="text-xs text-tx-secondary truncate mt-0.5">
                        {conv.lastMsgText}
                      </p>
                    </div>
                  </button>
                </motion.div>
              );
            })}
          </div>
        </aside>

        {/* Main conversation pane */}
        {conversationId ? (
          <ChatPane conversationId={conversationId} />
        ) : (
          <EmptyChatState hasChats={processedConversations.length > 0} />
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
      {callState !== 'IDLE' && (
        <Suspense fallback={null}>
          <CallOverlay />
        </Suspense>
      )}
      <AISidecar />
    </div>
  );
}