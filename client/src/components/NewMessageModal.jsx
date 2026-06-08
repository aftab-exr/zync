import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Loader2, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/axios';
import { auth } from '../lib/firebase';
import { useChatStore } from '../store/useChatStore'; // ⚡ NEW: Import the Chat Store

export default function NewMessageModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { fetchConversations } = useChatStore(); // ⚡ NEW: Extract the fetch function
  
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Network Debounce & State Synchronization
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
        try {
        const token = await auth.currentUser.getIdToken();
        const res = await api.get(`/users/search?q=${query}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setResults(res.data.data);
      } catch (error) {
        console.error("Search failed:", error);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  // Algorithm: DM Initiation Handler
  const startConversation = async (targetUserId) => {
    setIsCreating(true);
    try {
      const token = await auth.currentUser.getIdToken();
      
      // 1. Create or fetch the DM from MongoDB
      const res = await api.post('/conversations', 
        { targetUserId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const conversationId = res.data.data._id;
      
      // 2. ⚡ HYDRATE THE STATE: Force the sidebar to update so ChatPane knows about it
      await fetchConversations();

      // 3. Close modal and route to the new chat
      onClose();
      setQuery('');
      navigate(`/inbox/${conversationId}`);
      
    } catch (error) {
      console.error("Failed to start conversation:", error);
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="w-full max-w-lg bg-[var(--bg-surface)] border rounded-xl shadow-2xl overflow-hidden flex flex-col"
          style={{ borderColor: 'var(--border)', maxHeight: '80vh' }}
        >
          {/* Header & Input */}
          <div className="p-4 border-b flex items-center gap-3 relative" style={{ borderColor: 'var(--border)' }}>
            <Search className="w-5 h-5 text-[var(--text-secondary)]" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users by name..."
              className="flex-1 bg-transparent border-none outline-none text-white font-mono placeholder:text-[var(--text-secondary)] text-sm"
            />
            {isSearching && <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--bg-base)] text-[var(--text-secondary)] transition-all duration-200 ease-in-out active:scale-95">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Results Area */}
          <div className="flex-1 overflow-y-auto p-2 min-h-[200px]">
            {query.length < 2 && (
              <div className="h-full flex flex-col items-center justify-center text-center text-[var(--text-secondary)] text-sm py-10">
                <UserPlus className="w-8 h-8 mb-3 opacity-50" />
                <p>Type at least 2 characters to search.</p>
              </div>
            )}

            {query.length >= 2 && results.length === 0 && !isSearching && (
              <div className="text-center text-[var(--text-secondary)] text-sm py-10">
                No users found matching "{query}"
              </div>
            )}

            <div className="space-y-1">
              {results.map((user) => (
                <button
                  key={user._id}
                  onClick={() => startConversation(user._id)}
                  disabled={isCreating}
                  className="w-full flex items-center justify-between px-3 py-3 rounded-lg hover:bg-[var(--bg-base)] transition-all duration-200 ease-in-out text-left group min-h-[56px] active:scale-95 disabled:opacity-50"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-[var(--border)] flex items-center justify-center font-display font-bold text-sm text-white flex-shrink-0">
                      {user.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-white text-sm font-medium truncate">{user.displayName}</h4>
                      <p className="text-[var(--text-secondary)] text-xs font-mono truncate">@{user.username}</p>
                    </div>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-all duration-200 ease-in-out flex-shrink-0 ml-2">
                    <span className="text-[var(--accent)] text-xs font-medium bg-[rgba(79,142,247,0.1)] px-3 py-2 rounded-full flex items-center gap-1 whitespace-nowrap">
                      {isCreating ? <Loader2 className="w-3 h-3 animate-spin" /> : "Message"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}