import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Loader2, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { auth } from '../lib/firebase';

export default function NewMessageModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Algorithm: Network Debounce (Protects your MongoDB Sandbox)
 // Algorithm: Network Debounce & State Synchronization
 useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      // Move the clear logic INSIDE the async timeout
      if (query.trim().length < 2) {
        setResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        const token = await auth.currentUser.getIdToken();
        const res = await axios.get(`http://localhost:4000/api/v1/users/search?q=${query}`, {
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
      
      // Fire the DM Deduplication route
      const res = await axios.post('http://localhost:4000/api/v1/conversations', 
        { targetUserId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const conversationId = res.data.data._id;
      
      // Close modal and route to the new chat
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
              className="flex-1 bg-transparent border-none outline-none text-white font-mono placeholder:text-[var(--text-secondary)]"
            />
            {isSearching && <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />}
            <button onClick={onClose} className="p-1 rounded-md hover:bg-[var(--bg-base)] text-[var(--text-secondary)] transition-colors">
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
                  className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-[var(--bg-base)] transition-colors text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[var(--border)] flex items-center justify-center font-display font-bold text-sm">
                      {user.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-white text-sm font-medium">{user.displayName}</h4>
                      <p className="text-[var(--text-secondary)] text-xs font-mono">@{user.username}</p>
                    </div>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[var(--accent)] text-xs font-medium bg-[rgba(79,142,247,0.1)] px-3 py-1 rounded-full">
                      Message
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