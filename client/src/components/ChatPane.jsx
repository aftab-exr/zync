import { useState, useEffect, useRef } from 'react';
import { Send, MoreVertical, Phone, Video, Loader2, ChevronLeft, Sparkles, Copy, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMessageStore } from '../store/useMessageStore';
import { useChatStore } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';
import { useSocketStore } from '../store/useSocketStore';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function CodeBlock({ inline, className, children, ...props }) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : 'text';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (inline) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  return (
    <div className="my-2 rounded-lg overflow-hidden border border-[var(--border)]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#0d0d0d] border-b border-[var(--border)]">
        <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-secondary)]">
          {language}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--text-secondary)] hover:text-white transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-[var(--success)]" />
              <span className="text-[var(--success)]">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 bg-[#1a1a1a] m-0">
        <code className={`${className || ''} text-xs font-mono text-[var(--text-primary)]`} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

export default function ChatPane({ conversationId }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  
  // Connect all three Zustand Brains
  const { user } = useAuthStore();
  const { conversations } = useChatStore();
  const { messages, fetchMessages, sendMessage, subscribeToMessages, unsubscribeFromMessages, isFetching, typingConversations } = useMessageStore();
  const { socket } = useSocketStore();

  const isTyping = typingConversations[conversationId];

  // Algorithm: Navigate back to sidebar on mobile
  const handleBackToSidebar = () => {
    navigate('/inbox');
  };

  // Extract the specific conversation we are looking at to get the receiver's ID
  const activeConversation = conversations.find(c => c._id === conversationId);
  const isGroup = activeConversation?.isGroup;
  const otherUser = activeConversation?.otherUser;
  const headerName = isGroup
    ? activeConversation?.groupName || 'Group Chat'
    : otherUser?.displayName;

  // Component Lifecycle: Fetch & Subscribe
  useEffect(() => {
    if (!conversationId) return;
    fetchMessages(conversationId);
  }, [conversationId, fetchMessages]);

  useEffect(() => {
    if (!conversationId || !socket) return;
    
    subscribeToMessages(conversationId);
    
    return () => unsubscribeFromMessages();
  }, [conversationId, socket, subscribeToMessages, unsubscribeFromMessages]);

  // Clean up typing timeout if component unmounts or chat switches
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [conversationId]);

  // Auto-Scroll Algorithm (now dependencies include isTyping to scroll when bubbles appear)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // ⚡ The Debounce Core Algorithm
  const handleInputChange = (e) => {
    setText(e.target.value);

    if (!socket || !otherUser) return;

    // Emit active signal immediately
    socket.emit("typing_start", { 
      receiverId: otherUser._id, 
      conversationId 
    });

    // Erase past timers if user is still typing mid-window
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Spawn execution boundary to shut off indicator after 2 seconds of silence
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("typing_end", { 
        receiverId: otherUser._id, 
        conversationId 
      });
    }, 2000);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!text.trim() || !otherUser) return;
    
    const messageContent = text;
    setText(''); // Clear UI instantly for perceived sub-100ms latency
    
    // Clear typing indicator instantly when sending
    if (socket) {
      socket.emit("typing_end", { receiverId: otherUser._id, conversationId });
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    await sendMessage(conversationId, messageContent, otherUser._id);
  };

  // Safety fallback if data hasn't hydrated yet
  if (!otherUser || !headerName) return <div className="flex-1 bg-[var(--bg-base)]"></div>;

  return (
    <div className="flex-1 flex flex-col bg-[var(--bg-base)] overflow-hidden">
      
      {/* Header - Sticky Mobile Header */}
      <div className="h-12 border-b flex items-center justify-between px-6 bg-[var(--bg-surface)] z-10 sticky top-0 shrink-0" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          {/* Back Button (Mobile Only) */}
          <button
            onClick={handleBackToSidebar}
            className="block md:hidden p-1.5 hover:bg-[var(--bg-base)] rounded-md transition-colors text-[var(--text-secondary)] hover:text-white"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          
          <div className="w-8 h-8 rounded-full bg-[var(--border)] flex items-center justify-center font-display font-bold text-xs text-white relative">
            {headerName.charAt(0).toUpperCase()}
            {!isGroup && otherUser.status?.online && (
              <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[var(--success)] border-2 border-[var(--bg-surface)] rounded-full"></div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-medium text-white leading-none">{headerName}</h3>
              {!isGroup && otherUser.isAI && <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />}
            </div>
            <p className="text-[10px] text-[var(--success)] font-mono mt-1 leading-none opacity-80">
              {isGroup
                ? `${activeConversation.participants?.length ?? 0} members`
                : otherUser.isAI
                  ? 'Quantum Processing Active'
                  : 'Encrypted Session'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-5 text-[var(--text-secondary)]">
          <Phone className="w-4 h-4 hover:text-white cursor-pointer transition-colors" />
          <Video className="w-4 h-4 hover:text-white cursor-pointer transition-colors" />
          <MoreVertical className="w-4 h-4 hover:text-white cursor-pointer transition-colors" />
        </div>
      </div>

      {/* Message History */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0">
        {isFetching ? (
          <div className="flex justify-center mt-10">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" />
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center justify-center mt-4 mb-8">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-secondary)] bg-[var(--bg-surface)] px-4 py-1.5 rounded-full border" style={{ borderColor: 'var(--border)' }}>
                Beginning of secure conversation
              </div>
            </div>

            {messages.map((msg) => {
              const isMine = msg.senderId === user._id;
              return (
                <div key={msg._id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div 
                    className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm overflow-x-auto ${
                      isMine 
                        ? 'bg-[var(--accent)] text-white rounded-br-sm' 
                        : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border)] rounded-bl-sm'
                    }`}
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{ code: CodeBlock }}
                      className="prose prose-sm dark:prose-invert max-w-none break-words"
                    >
                      {msg.text}
                    </ReactMarkdown>
                  </div>
                </div>
              );
            })}

            {/* ⚡ Transient Typing Interface */}
            {isTyping && (
              <div className="flex w-full mt-2 space-x-3 max-w-xs self-start items-end animate-fade-in">
                <div className="bg-[var(--bg-surface)] px-4 py-3 rounded-2xl rounded-tl-none border border-[var(--border)] flex items-center gap-1">
                  <span className="w-2 h-2 bg-[var(--text-secondary)] rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="w-2 h-2 bg-[var(--text-secondary)] rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="w-2 h-2 bg-[var(--text-secondary)] rounded-full animate-bounce"></span>
                </div>
              </div>
            )}
            
            {/* Invisible div to attach the auto-scroll ref (Placed after typing indicator) */}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-[var(--bg-base)] border-t shrink-0" style={{ borderColor: 'var(--border)' }}>
        <form onSubmit={handleSendMessage} className="flex items-center gap-3 bg-[var(--bg-surface)] border rounded-xl pl-4 pr-2 py-2" style={{ borderColor: 'var(--border)' }}>
          <input
            type="text"
            value={text}
            onChange={handleInputChange}
            placeholder={isGroup ? 'Message group...' : `Message @${otherUser.username}...`}
            className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder:text-[var(--text-secondary)]"
            autoComplete="off"
          />
          <button 
            type="submit" 
            disabled={!text.trim()} 
            className="p-2.5 rounded-lg bg-[var(--accent)] text-white disabled:opacity-50 disabled:bg-[var(--border)] transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
      
    </div>
  );
}