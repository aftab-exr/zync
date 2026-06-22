import { useEffect, useState } from 'react';
import { useSocketStore } from '../store/useSocketStore';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';
import { api } from '../lib/axios';
import { auth } from '../lib/firebase';
import ChatPane from '../components/ChatPane';
import AISidecar from '../components/AISidecar';
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
          setErrorMsg("Error searching for AI agent.");
        } finally {
          setLoadingAI(false);
        }
      }
    };

    findOrCreateAIConversation();
  }, [conversations, isFetchingConversations, currentUser?._id, createConversation]);

  return (
    <div className="fixed inset-0 h-[100dvh] w-screen overflow-hidden flex flex-col bg-base select-none">
      {/* Neubrutalist Ambient AI Station Header */}
      <header className="h-14 border-b-3 border-border flex items-center justify-between px-6 bg-surface shrink-0 z-30">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent animate-pulse" />
          <h1 className="text-sm font-display font-bold tracking-wider text-tx-primary uppercase">
            ZYNC // SIDECAR FOCUS STATION
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-success shadow-[0_0_8px_var(--success)]' : 'bg-warning animate-ping'}`} />
          <span className="text-[10px] font-mono text-tx-secondary tracking-widest uppercase font-bold">
            {isConnected ? 'STABLE_CONN' : 'RECONNECTING'}
          </span>
        </div>
      </header>

      {/* Main Terminal Chat Area */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        {loadingAI ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-base gap-3">
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
            <p className="text-xs font-mono text-tx-secondary uppercase tracking-widest font-bold">
              Initializing AI Session...
            </p>
          </div>
        ) : errorMsg ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-base p-6 text-center">
            <p className="text-sm font-mono text-secondary uppercase tracking-wide mb-2 font-bold">
              SYSTEM_ALERT: Fault Detected
            </p>
            <p className="text-xs text-tx-secondary mb-4 font-semibold">{errorMsg}</p>
            <button 
              onClick={() => {
                setErrorMsg(null);
                setLoadingAI(true);
                fetchConversations();
              }}
              className="px-4 py-2 border-3 border-border rounded-lg bg-primary text-xs font-mono text-tx-primary font-bold shadow-brutal-sm hover:bg-primary-hover active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
            >
              REBOOT_SESSION
            </button>
          </div>
        ) : (
          <ChatPane conversationId={activeConversationId} isSidecar={true} />
        )}
      </div>

      <AISidecar />
    </div>
  );
}
