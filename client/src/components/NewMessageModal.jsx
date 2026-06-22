import { useState, useEffect } from 'react';
import { X, Search, Users, Check, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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

    const newGroup = await createGroup(groupName, selectedUsers);

    if (newGroup) {
      onSelectConversation(newGroup._id);
      handleClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md bg-surface border-3 border-border rounded-lg shadow-brutal flex flex-col max-h-[85vh] sm:max-h-[80vh] overflow-hidden text-tx-primary"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b-3 border-border bg-base">
              <h2 className="text-lg font-display font-bold text-tx-primary">
                {isGroupMode ? 'Create Group' : 'New Message'}
              </h2>
              <button 
                onClick={handleClose} 
                className="p-2 rounded-lg border-3 border-transparent hover:border-border hover:bg-surface text-tx-secondary hover:text-tx-primary transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none hover:shadow-brutal-sm"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Group Toggle & Name Input */}
            <div className="p-4 border-b-3 border-border space-y-4">
              <button
                onClick={() => setIsGroupMode(!isGroupMode)}
                className={`flex items-center gap-3 w-full p-3 rounded-lg border-3 transition-all text-tx-primary hover:bg-base ${isGroupMode ? 'border-border bg-surface shadow-brutal-sm' : 'border-transparent'}`}
              >
                <div className="w-10 h-10 rounded-lg border-2 border-border bg-accent text-tx-primary flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
                <div className="text-left flex-1">
                  <h3 className="text-sm font-bold">New Group</h3>
                  <p className="text-xs text-tx-secondary">Create a conversation with multiple people</p>
                </div>
                {isGroupMode && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}><Check className="w-5 h-5 text-accent" /></motion.div>}
              </button>

              {isGroupMode && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3">
                  <input
                    type="text"
                    placeholder="Group Name"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="w-full bg-base border-3 border-border text-tx-primary placeholder-tx-secondary text-sm rounded-lg p-3 focus:outline-none focus:border-accent transition-colors font-mono"
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
                            className="flex items-center gap-1.5 bg-primary border-3 border-border px-3 py-1.5 rounded-lg text-xs text-tx-primary font-bold shadow-brutal-sm"
                          >
                            {u.displayName}
                            <X className="w-3 h-3 cursor-pointer text-tx-secondary hover:text-secondary transition-colors" onClick={() => handleUserClick(u)} />
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tx-secondary" />
                <input
                  type="text"
                  placeholder="Search users by username..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-base text-tx-primary placeholder-tx-secondary text-sm rounded-lg pl-10 pr-4 py-3 border-3 border-border focus:outline-none focus:border-accent transition-colors font-mono"
                />
              </div>
            </div>

            {/* Results List */}
            <div className="flex-1 overflow-y-auto p-2 min-h-[250px] bg-base">
              {isSearching ? (
                <div className="flex justify-center p-8"><Loader2 className="w-5 h-5 animate-spin text-accent" /></div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-1">
                  {searchResults.map((user) => {
                    const isSelected = selectedUsers.some(u => u._id === user._id);
                    return (
                      <button
                        key={user._id}
                        onClick={() => handleUserClick(user)}
                        className={`flex items-center justify-between w-full p-3 rounded-lg border-3 transition-colors group text-tx-primary ${isSelected ? 'bg-surface border-border shadow-brutal-sm' : 'border-transparent hover:bg-surface/50'}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg border-2 border-border bg-accent flex items-center justify-center font-bold text-sm text-tx-primary group-hover:bg-accent/80 transition-colors">
                            {user.displayName.charAt(0).toUpperCase()}
                          </div>
                          <div className="text-left">
                            <h4 className="text-sm font-bold text-tx-primary">{user.displayName}</h4>
                            <p className="text-xs text-tx-secondary font-mono">@{user.username}</p>
                          </div>
                        </div>
                        {isGroupMode && (
                          <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-accent border-border' : 'border-border bg-surface'}`}>
                            {isSelected && <Check className="w-3 h-3 text-tx-primary font-bold" />}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-tx-secondary p-8 text-center">
                  <Users className="w-8 h-8 mb-3 opacity-50 text-tx-secondary" />
                  <p className="text-sm font-bold">Search for users to start a conversation</p>
                </div>
              )}
            </div>

            {/* Group Create Footer */}
            {isGroupMode && (
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="p-4 border-t-3 border-border bg-surface shrink-0">
                <button
                  onClick={handleCreateGroup}
                  disabled={!groupName.trim() || selectedUsers.length === 0 || isCreatingGroup}
                  className="w-full flex items-center justify-center py-3 border-3 border-border rounded-lg bg-accent text-tx-primary font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent-hover transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none shadow-brutal-sm"
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