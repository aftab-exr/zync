import { useState, useEffect, useRef } from "react";
import { Send, Users, Sparkles, ShieldCheck, Copy, Check, ChevronLeft, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";

import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { useMessageStore } from "../store/useMessageStore";

// ⚡ Premium AI Code Block Renderer
const CodeBlock = ({ inline, className, children, ...props }) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');

  const handleCopy = () => {
    navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!inline && match) {
    return (
      <div className="relative mt-4 mb-4 rounded-xl overflow-hidden bg-[#1e1e2e] border border-[var(--border)] shadow-sm">
        <div className="flex items-center justify-between px-4 py-2 bg-[#2a2a3c] border-b border-[var(--border)]">
          <span className="text-xs font-mono text-gray-400 uppercase tracking-wider">{match[1]}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-[var(--success)]" />
                <span className="text-[var(--success)]">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
        <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed text-gray-100 font-mono m-0">
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      </div>
    );
  }

  return (
    <code className="bg-[#2a2a3c] text-[#6BA3FF] px-1.5 py-0.5 rounded-md text-sm font-mono border border-[var(--border)]" {...props}>
      {children}
    </code>
  );
};

export default function ChatPane({ conversationId }) {
  const [text, setText] = useState("");
  const messagesEndRef = useRef(null);
  const navigate = useNavigate();
  
  const { authUser, user } = useAuthStore();
  const currentUser = authUser || user; // Fallback for state mapping

  const { conversations } = useChatStore();
  const { 
    messages, 
    fetchMessages, 
    sendMessage, 
    subscribeToMessages, 
    unsubscribeFromMessages,
    isFetching,
    isSending,
    typingConversations
  } = useMessageStore();

  // Extract Context using the normalized store data
  const activeConversation = conversations.find(c => c._id === conversationId);
  const displayUser = activeConversation?.otherUser;
  const isGroup = activeConversation?.isGroup;
  const isOnline = displayUser?.status?.online;
  const isSomeoneTyping = typingConversations[conversationId];

  // Lifecycle: Hydrate Messages & Sockets
  useEffect(() => {
    if (conversationId) {
      fetchMessages(conversationId);
      subscribeToMessages(conversationId);
    }
    return () => unsubscribeFromMessages();
  }, [conversationId, fetchMessages, subscribeToMessages, unsubscribeFromMessages]);

  // Lifecycle: Auto-Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSomeoneTyping]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim() || isSending) return;

    const currentText = text.trim();
    // ⚡ Optimistic UI: Clear the box immediately so it feels snappy
    setText("");

    // Send payload. If it fails, the store will return false so we can restore the text.
    const success = await sendMessage(conversationId, currentText, displayUser?._id);
    if (!success) {
      setText(currentText);
    }
  };

  // Loading Skeleton
  if (isFetching && messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col h-full bg-[var(--bg-base)] items-center justify-center">
        <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--bg-base)] overflow-hidden">
      
      {/* ⚡ HEADER */}
      <div className="h-14 flex items-center justify-between px-4 md:px-6 border-b border-[var(--border)] bg-[var(--bg-surface)] shrink-0">
        <div className="flex items-center gap-3">
          {/* Mobile Back Button */}
          <button 
            onClick={() => navigate('/inbox')}
            className="md:hidden p-2 -ml-2 text-[var(--text-secondary)] hover:text-white transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          {/* Avatar / Group Icon */}
          <div className="relative">
            {isGroup ? (
              <div className="w-9 h-9 rounded-full bg-[var(--accent-dim)] text-[var(--accent)] flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            ) : (
              <div className="w-9 h-9 rounded-full bg-[var(--border)] flex items-center justify-center font-bold text-sm text-white overflow-hidden">
                {displayUser?.avatarUrl ? (
                  <img src={displayUser.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  displayUser?.displayName?.charAt(0).toUpperCase()
                )}
              </div>
            )}
            {!isGroup && isOnline && (
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[var(--success)] border-2 border-[var(--bg-surface)] rounded-full"></span>
            )}
          </div>

          <div>
            <h2 className="text-[15px] font-semibold text-white flex items-center gap-1.5 leading-tight">
              {displayUser?.displayName || "Unknown"}
              {!isGroup && displayUser?.isAI && <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />}
            </h2>
            <p className="text-xs text-[var(--text-secondary)] font-mono">
              {isGroup ? displayUser?.username : (displayUser?.isAI ? 'Quantum Processing Active' : (isOnline ? 'Online' : 'Offline'))}
            </p>
          </div>
        </div>
        
        {!isGroup && !displayUser?.isAI && (
          <div className="flex items-center gap-1.5 text-xs text-[var(--success)] px-3 py-1.5 rounded-full bg-[var(--bg-raised)] border border-[var(--border)] hidden md:flex">
            <ShieldCheck className="w-4 h-4" />
            <span>End-to-End Encrypted</span>
          </div>
        )}
      </div>

      {/* ⚡ MESSAGE FEED (With Native Framer Motion Physics) */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 overflow-x-hidden">
        <AnimatePresence initial={false}>
          {messages.map((msg, index) => {
            const isMine = msg.senderId === currentUser?._id;
            
            // In a group, we show the sender's name if it's not us
            const sender = isGroup && !isMine 
              ? activeConversation?.participants?.find(p => p._id === msg.senderId)
              : null;

            return (
              <motion.div 
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                key={msg._id || index} 
                className={`flex flex-col ${isMine ? 'items-end origin-bottom-right' : 'items-start origin-bottom-left'}`}
              >
                
                {/* Group Sender Name */}
                {isGroup && !isMine && sender && (
                  <span className="text-xs text-[var(--text-secondary)] mb-1 ml-1 font-medium">
                    {sender.displayName}
                  </span>
                )}

                <div className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm ${
                  isMine 
                    ? 'bg-[var(--accent)] text-white rounded-br-sm' 
                    : 'bg-[var(--bg-raised)] border border-[var(--border)] text-white rounded-bl-sm'
                }`}>
                  {/* React Markdown Fix applied here */}
                  <div className={`prose prose-sm max-w-none break-words ${isMine ? 'prose-invert prose-p:text-white' : 'dark:prose-invert'}`}>
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]} 
                      components={{ code: CodeBlock }}
                    >
                      {msg.text}
                    </ReactMarkdown>
                  </div>
                </div>
                
                <div className="flex items-center gap-1 mt-1 text-[11px] text-[var(--text-secondary)] font-mono">
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {isMine && <Check className="w-3 h-3 text-[var(--text-secondary)] ml-1" />}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Typing Indicator */}
        <AnimatePresence>
          {isSomeoneTyping && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-2 text-[var(--text-secondary)] text-sm p-2"
            >
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-[var(--text-secondary)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-[var(--text-secondary)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-[var(--text-secondary)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-xs font-medium">typing...</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      {/* ⚡ COMPOSER */}
      <div className="p-3 md:p-4 bg-[var(--bg-surface)] border-t border-[var(--border)] shrink-0">
        <form onSubmit={handleSend} className="flex items-end gap-2 max-w-4xl mx-auto relative">
          <div className="flex-1 bg-[var(--bg-base)] border border-[var(--border)] rounded-2xl p-1 flex items-center focus-within:border-[var(--accent)] transition-colors shadow-sm">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
              placeholder={isGroup ? `Message ${displayUser?.displayName}...` : `Message @${displayUser?.username || ''}...`}
              className="w-full max-h-32 min-h-[44px] bg-transparent text-sm text-white resize-none focus:outline-none py-3 px-4 font-body"
              rows={1}
            />
          </div>
          <button 
            type="submit"
            disabled={!text.trim() || isSending}
            className="w-12 h-12 rounded-full bg-[var(--accent)] text-white flex items-center justify-center hover:bg-[var(--accent-hover)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 active:scale-95 shadow-md"
          >
            {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-1" />}
          </button>
        </form>
      </div>
      
    </div>
  );
}