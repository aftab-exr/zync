import { useState, useEffect, useRef } from 'react';
import { Send, MoreVertical, Phone, Video, Loader2, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMessageStore } from '../store/useMessageStore';
import { useChatStore } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';
import { useSocketStore } from '../store/useSocketStore';

export default function ChatPane({ conversationId }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const messagesEndRef = useRef(null);
  
  // Connect all three Zustand Brains
  const { user } = useAuthStore();
  const { conversations } = useChatStore();
  const { messages, fetchMessages, sendMessage, subscribeToMessages, unsubscribeFromMessages, isFetching } = useMessageStore();
  const { socket } = useSocketStore();

  // Algorithm: Navigate back to sidebar on mobile
  const handleBackToSidebar = () => {
    navigate('/inbox');
  };

  // Extract the specific conversation we are looking at to get the receiver's ID
  const activeConversation = conversations.find(c => c._id === conversationId);
  const otherUser = activeConversation?.otherUser;

  // Component Lifecycle: Fetch & Subscribe
  // Lifecycle 1: Data Fetching (Runs immediately)
  useEffect(() => {
    if (!conversationId) return;
    fetchMessages(conversationId);
  }, [conversationId, fetchMessages]);

  // Lifecycle 2: Real-Time Subscription (Waits for the socket connection)
  useEffect(() => {
    // If we have no chat selected OR the socket handshake isn't finished, wait.
    if (!conversationId || !socket) return;
    
    subscribeToMessages(conversationId);
    
    return () => unsubscribeFromMessages();
  }, [conversationId, socket, subscribeToMessages, unsubscribeFromMessages]); // React re-runs this the exact moment `socket` connects

  // Auto-Scroll Algorithm
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!text.trim() || !otherUser) return;
    
    const messageContent = text;
    setText(''); // Clear UI instantly for perceived sub-100ms latency
    
    await sendMessage(conversationId, messageContent, otherUser._id);
  };

  // Safety fallback if data hasn't hydrated yet
  if (!otherUser) return <div className="flex-1 bg-[var(--bg-base)]"></div>;

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
            {otherUser.displayName.charAt(0).toUpperCase()}
            {otherUser.status?.online && (
              <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[var(--success)] border-2 border-[var(--bg-surface)] rounded-full"></div>
            )}
          </div>
          <div>
            <h3 className="text-sm font-medium text-white leading-none">{otherUser.displayName}</h3>
            <p className="text-[10px] text-[var(--success)] font-mono mt-1 leading-none opacity-80">Encrypted Session</p>
          </div>
        </div>
        
        <div className="flex items-center gap-5 sm:gap-6 text-[var(--text-secondary)]">
          <button className="p-2 hover:bg-[var(--bg-base)] rounded-lg transition-all duration-200 ease-in-out active:scale-95 hover:text-white">
            <Phone className="w-4 h-4" />
          </button>
          <button className="p-2 hover:bg-[var(--bg-base)] rounded-lg transition-all duration-200 ease-in-out active:scale-95 hover:text-white">
            <Video className="w-4 h-4" />
          </button>
          <button className="p-2 hover:bg-[var(--bg-base)] rounded-lg transition-all duration-200 ease-in-out active:scale-95 hover:text-white">
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Message History */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 min-h-0">
        {isFetching ? (
          <div className="flex justify-center mt-10">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" />
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center justify-center mt-4 mb-8">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-secondary)] bg-[var(--bg-surface)] px-4 py-2 sm:py-1.5 rounded-full border" style={{ borderColor: 'var(--border)' }}>
                Beginning of secure conversation
              </div>
            </div>

            {messages.map((msg) => {
              const isMine = msg.senderId === user._id;
              return (
                <div key={msg._id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div 
                    className={`max-w-xs sm:max-w-sm px-4 py-2.5 rounded-2xl text-sm transition-all duration-200 ease-in-out ${
                      isMine 
                        ? 'bg-[var(--accent)] text-white rounded-br-sm' 
                        : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border)] rounded-bl-sm'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              );
            })}
            {/* Invisible div to attach the auto-scroll ref */}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="p-3 sm:p-4 bg-[var(--bg-base)] border-t shrink-0" style={{ borderColor: 'var(--border)' }}>
        <form onSubmit={handleSendMessage} className="flex items-center gap-2 sm:gap-3 bg-[var(--bg-surface)] border rounded-xl px-4 py-2 sm:py-2.5 transition-all duration-200 ease-in-out focus-within:border-[var(--accent)]" style={{ borderColor: 'var(--border)' }}>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Message @${otherUser.username}...`}
            className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder:text-[var(--text-secondary)]"
            autoComplete="off"
          />
          <button 
            type="submit" 
            disabled={!text.trim()} 
            className="p-2 sm:p-2.5 rounded-lg bg-[var(--accent)] text-white disabled:opacity-50 disabled:bg-[var(--border)] transition-all duration-200 ease-in-out active:scale-95 hover:brightness-110 disabled:active:scale-100"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
      
    </div>
  );
}