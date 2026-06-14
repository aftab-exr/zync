import { useState, useEffect } from 'react';
import { X, Search, Users, Check, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion'; // ⚡ INJECTED PHYSICS
import { useChatStore } from '../store/useChatStore';
import { api } from '../lib/axios';
import { auth } from '../lib/firebase';

export default function NewMessageModal({ isOpen, onClose, onSelectConversation }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);

  const { createConversation, createGroup, isCreatingGroup } = useChatStore();

  const handleClose = () => {
    setSearchQuery('');
    setSearchResults([]);
    setIsGroupMode(false);
    setGroupName('');
    setSelectedUsers([]);
    onClose();
  };

  useEffect(() => {
    const searchUsers = async () => {
      if (searchQuery.trim().length < 2) {
        setSearchResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await api.get(`/users/search?q=${searchQuery}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSearchResults(res.data.data);
      } catch (error) {
        console.error("Search failed", error);
      } finally {
        setIsSearching(false);
      }
    };

    const delayDebounceFn = setTimeout(() => searchUsers(), 300);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleUserClick = async (user) => {
    if (isGroupMode) {
      if (selectedUsers.find(u => u._id === user._id)) {
        setSelectedUsers(selectedUsers.filter(u => u._id !== user._id));
      } else {
        setSelectedUsers([...selectedUsers, user]);
      }
    } else {
      const conversation = await createConversation(user._id);
      if (conversation) {
        onSelectConversation(conversation._id);
        handleClose();
      }
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedUsers.length === 0) return;

    // ⚡ VECTOR 2: pass full user objects (carry publicKey) so the store can
    // wrap the group symmetric key per-member for Zero-Knowledge group E2EE.
    const newGroup = await createGroup(groupName, selectedUsers);

    if (newGroup) {
      onSelectConversation(newGroup._id);
      handleClose();
    }
  };

  // ⚡ AnimatePresence allows Framer Motion to animate the component BEFORE it unmounts from the DOM
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">

          {/* Backdrop Blur Animation */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* ⚡ The Native Spring Physics Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col max-h-[85vh] sm:max-h-[80vh] overflow-hidden"
          >

            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
              <h2 className="text-lg font-display font-bold text-white">
                {isGroupMode ? 'Create Group' : 'New Message'}
              </h2>
              <button onClick={handleClose} className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-base)] transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Group Toggle & Name Input */}
            <div className="p-4 border-b border-[var(--border)] space-y-4">
              <button
                onClick={() => setIsGroupMode(!isGroupMode)}
                className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-[var(--bg-base)] text-[var(--text-primary)] transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-[var(--accent-dim)] text-[var(--accent)] flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
                <div className="text-left flex-1">
                  <h3 className="text-sm font-medium">New Group</h3>
                  <p className="text-xs text-[var(--text-secondary)]">Create a conversation with multiple people</p>
                </div>
                {isGroupMode && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}><Check className="w-5 h-5 text-[var(--accent)]" /></motion.div>}
              </button>

              {isGroupMode && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3">
                  <input
                    type="text"
                    placeholder="Group Name"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="w-full bg-[var(--bg-base)] border border-[var(--border)] text-white text-sm rounded-xl p-3 focus:outline-none focus:border-[var(--accent)] transition-colors"
                  />

                  {/* Selected Users Pills */}
                  {selectedUsers.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      <AnimatePresence>
                        {selectedUsers.map(u => (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            key={u._id}
                            className="flex items-center gap-1.5 bg-[var(--bg-raised)] border border-[var(--border)] px-3 py-1.5 rounded-full text-xs text-white"
                          >
                            {u.displayName}
                            <X className="w-3 h-3 cursor-pointer text-[var(--text-secondary)] hover:text-[var(--error)] transition-colors" onClick={() => handleUserClick(u)} />
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                <input
                  type="text"
                  placeholder="Search users by username..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[var(--bg-base)] text-white text-sm rounded-xl pl-10 pr-4 py-3 border border-[var(--border)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>
            </div>

            {/* Results List */}
            <div className="flex-1 overflow-y-auto p-2 min-h-[250px]">
              {isSearching ? (
                <div className="flex justify-center p-8"><Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /></div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-1">
                  {searchResults.map((user) => {
                    const isSelected = selectedUsers.some(u => u._id === user._id);
                    return (
                      <button
                        key={user._id}
                        onClick={() => handleUserClick(user)}
                        className="flex items-center justify-between w-full p-3 rounded-xl hover:bg-[var(--bg-base)] transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[var(--border)] flex items-center justify-center font-bold text-sm text-white group-hover:bg-[var(--border-active)] transition-colors">
                            {user.displayName.charAt(0).toUpperCase()}
                          </div>
                          <div className="text-left">
                            <h4 className="text-sm font-medium text-white">{user.displayName}</h4>
                            <p className="text-xs text-[var(--text-secondary)]">@{user.username}</p>
                          </div>
                        </div>
                        {isGroupMode && (
                          <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${isSelected ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--text-secondary)]'}`}>
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] p-8 text-center">
                  <Users className="w-8 h-8 mb-3 opacity-50" />
                  <p className="text-sm">Search for users to start a conversation</p>
                </div>
              )}
            </div>

            {/* Group Create Footer */}
            {isGroupMode && (
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="p-4 border-t border-[var(--border)] bg-[var(--bg-surface)]">
                <button
                  onClick={handleCreateGroup}
                  disabled={!groupName.trim() || selectedUsers.length === 0 || isCreatingGroup}
                  className="w-full flex items-center justify-center py-3 rounded-xl bg-[var(--accent)] text-white font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--accent-hover)] transition-all active:scale-[0.98]"
                >
                  {isCreatingGroup ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create Group'}
                </button>
              </motion.div>
            )}

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}