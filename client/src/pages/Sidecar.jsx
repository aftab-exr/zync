import React, { useEffect, useState } from 'react';
import { useSocketStore } from '../store/useSocketStore';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';
import { api } from '../lib/axios';
import { auth } from '../lib/firebase';
import ChatPane from '../components/ChatPane';
import { Loader2, Sparkles } from 'lucide-react';

export default function Sidecar() {
  const { connect, disconnect, isConnected } = useSocketStore();
  const { user, authUser } = useAuthStore();
  const currentUser = authUser || user;

  const { conversations, fetchConversations, createConversation, isFetchingConversations } = useChatStore();

  const [activeConversationId, setActiveConversationId] = useState(null);
  const [loadingAI, setLoadingAI] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  useEffect(() => {
    if (currentUser?._id) {
      fetchConversations();
    }
  }, [fetchConversations, currentUser?._id]);

  useEffect(() => {
    const findOrCreateAIConversation = async () => {
      if (!currentUser?._id || (conversations.length === 0 && isFetchingConversations)) return;

      const aiConv = conversations.find(c => !c.isGroup && c.participants?.some(p => p.isAI));
      if (aiConv) {
        setActiveConversationId(aiConv._id);
        setLoadingAI(false);
      } else {
        // Try to search for AI user and create conversation
        try {
          const token = await auth.currentUser?.getIdToken();
          const res = await api.get('/users/search?q=zync_ai', {
            headers: { Authorization: `Bearer ${token}` }
          });
          const aiUser = res.data.data?.find(u => u.isAI) || res.data.data?.[0];
          if (aiUser) {
            const newConv = await createConversation(aiUser._id);
            if (newConv) {
              setActiveConversationId(newConv._id);
            } else {
              setErrorMsg("Failed to start conversation with AI agent.");
            }
          } else {
            setErrorMsg("AI agent user not found.");
          }
        } catch (error) {
          console.error("Failed to find/create AI conversation:", error);
          setErrorMsg("Error searching for AI agent.");
        } finally {
          setLoadingAI(false);
        }
      }
    };

    findOrCreateAIConversation();
  }, [conversations, isFetchingConversations, currentUser?._id, createConversation]);

  // Design layout: Lock the viewport completely to 100dvh, 100vw, no scrolling, distraction-free
  return (
    <div className="fixed inset-0 h-[100dvh] w-screen overflow-hidden flex flex-col bg-[var(--bg-base)] select-none">
      {/* Sleek Minimal Ambient AI Station Header */}
      <header className="h-12 border-b border-[var(--border)] flex items-center justify-between px-6 bg-[var(--bg-surface)] shrink-0 z-30">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--accent)] animate-pulse" />
          <h1 className="text-sm font-display font-bold tracking-wider text-white uppercase">
            ZYNC // SIDECAR FOCUS STATION
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[var(--success)] shadow-[0_0_8px_var(--success)]' : 'bg-[var(--warning)] animate-ping'}`} />
          <span className="text-[10px] font-mono text-[var(--text-secondary)] tracking-widest uppercase">
            {isConnected ? 'STABLE_CONN' : 'RECONNECTING'}
          </span>
        </div>
      </header>

      {/* Main Terminal Chat Area */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        {loadingAI ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--bg-base)] gap-3">
            <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin" />
            <p className="text-xs font-mono text-[var(--text-secondary)] uppercase tracking-widest">
              Initializing AI Session...
            </p>
          </div>
        ) : errorMsg ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--bg-base)] p-6 text-center">
            <p className="text-sm font-mono text-[var(--error)] uppercase tracking-wide mb-2">
              SYSTEM_ALERT: Fault Detected
            </p>
            <p className="text-xs text-[var(--text-secondary)] mb-4">{errorMsg}</p>
            <button 
              onClick={() => {
                setErrorMsg(null);
                setLoadingAI(true);
                fetchConversations();
              }}
              className="px-4 py-2 rounded-lg bg-[var(--bg-raised)] border border-[var(--border)] text-xs font-mono text-white hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
            >
              REBOOT_SESSION
            </button>
          </div>
        ) : (
          <ChatPane conversationId={activeConversationId} isSidecar={true} />
        )}
      </div>
    </div>
  );
}
