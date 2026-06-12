import { useState, useEffect, useRef } from 'react';
import { Send, Users, Sparkles, ShieldCheck, Copy, Check, ChevronLeft, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';
import { useMessageStore } from '../store/useMessageStore';
import { useSocketStore } from '../store/useSocketStore';
import { sameId, getOtherParticipant, isUserOnline } from '../lib/conversation';

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
            type="button"
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
    <code
      className="bg-[#2a2a3c] text-[#6BA3FF] px-1.5 py-0.5 rounded-md text-sm font-mono border border-[var(--border)]"
      {...props}
    >
      {children}
    </code>
  );
};

export default function ChatPane() {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const messagesEndRef = useRef(null);

  const { selectedConversation, setSelectedConversation } = useChatStore();
  const { user } = useAuthStore();
  const {
    messages,
    fetchMessages,
    sendMessage,
    subscribeToMessages,
    unsubscribeFromMessages,
    isFetching,
  } = useMessageStore();
  const { onlineUsers } = useSocketStore();

  const conversationId = selectedConversation?._id;
  const isGroup = selectedConversation?.isGroup;
  const groupName = selectedConversation?.groupName;
  const otherUser = isGroup
    ? null
    : getOtherParticipant(selectedConversation?.participants, user?._id);
  const isOnline = otherUser
    ? isUserOnline(otherUser._id, onlineUsers, otherUser.status)
    : false;

  useEffect(() => {
    if (!conversationId) return;

    fetchMessages(conversationId);
    subscribeToMessages(conversationId);

    return () => unsubscribeFromMessages();
  }, [conversationId, fetchMessages, subscribeToMessages, unsubscribeFromMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleBack = () => {
    setSelectedConversation(null);
    navigate('/inbox');
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim() || !conversationId) return;

    const content = text.trim();
    setText('');
    await sendMessage(conversationId, content, otherUser?._id);
  };

  if (!selectedConversation) {
    return <div className="flex-1 bg-[#0D0D0F]" />;
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0D0D0F]">
      <div className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-[var(--border)] bg-[#141417]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="md:hidden p-2 -ml-2 text-[var(--text-secondary)] hover:text-white"
            aria-label="Back to conversations"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          {isGroup ? (
            <div className="w-10 h-10 rounded-full bg-[var(--accent-dim)] text-[var(--accent)] flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-[var(--border)] flex items-center justify-center font-bold text-sm text-white overflow-hidden relative">
              {otherUser?.avatarUrl ? (
                <img src={otherUser.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                (otherUser?.displayName || otherUser?.username || 'Unknown').charAt(0).toUpperCase()
              )}
              {isOnline && (
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-[var(--success)] border-2 border-[#141417] rounded-full" />
              )}
            </div>
          )}

          <div>
            <h2 className="text-[15px] font-semibold text-white flex items-center gap-1.5">
              {isGroup ? groupName : otherUser?.displayName}
              {!isGroup && otherUser?.isAI && <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />}
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              {isGroup
                ? `${selectedConversation.participants?.length ?? 0} members`
                : otherUser?.isAI
                  ? 'Quantum Processing Active'
                  : isOnline
                    ? 'Online'
                    : 'Offline'}
            </p>
          </div>
        </div>

        {!isGroup && !otherUser?.isAI && (
          <div className="items-center gap-1.5 text-xs text-[var(--success)] px-3 py-1.5 rounded-full bg-[#1C1C21] border border-[var(--border)] hidden md:flex">
            <ShieldCheck className="w-4 h-4" />
            <span>End-to-End Encrypted</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        {isFetching && messages.length === 0 ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" />
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMine = sameId(msg.senderId, user?._id);
            const sender =
              isGroup && !isMine
                ? selectedConversation.participants?.find((p) => sameId(p._id, msg.senderId))
                : null;

            return (
              <div key={msg._id || index} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                {isGroup && !isMine && sender && (
                  <span className="text-xs text-[var(--text-secondary)] mb-1 ml-1">
                    {sender.displayName}
                  </span>
                )}

                <div
                  className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-2.5 ${
                    isMine
                      ? 'bg-[var(--accent)] text-white rounded-br-sm'
                      : 'bg-[var(--bg-raised)] border border-[var(--border)] text-white rounded-bl-sm'
                  }`}
                >
                  <div
                    className={`prose prose-sm max-w-none break-words ${
                      isMine ? 'prose-invert prose-p:text-white' : 'dark:prose-invert'
                    }`}
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: CodeBlock }}>
                      {msg.text}
                    </ReactMarkdown>
                  </div>
                </div>

                <div className="flex items-center gap-1 mt-1 text-[11px] text-[var(--text-secondary)]">
                  {new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {isMine && <Check className="w-3 h-3 text-[var(--text-secondary)] ml-1" />}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-[#141417] border-t border-[var(--border)]">
        <form onSubmit={handleSend} className="flex items-end gap-2 max-w-4xl mx-auto">
          <div className="flex-1 bg-[var(--bg-base)] border border-[var(--border)] rounded-2xl p-1 flex items-center focus-within:border-[var(--border-active)] transition-colors">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
              placeholder={
                isGroup
                  ? `Message ${groupName || 'group'}...`
                  : `Message @${otherUser?.username || 'user'}...`
              }
              className="w-full max-h-32 min-h-[44px] bg-transparent text-sm text-white resize-none focus:outline-none py-3 px-4"
              rows={1}
            />
          </div>
          <button
            type="submit"
            disabled={!text.trim()}
            className="w-12 h-12 rounded-full bg-[var(--accent)] text-white flex items-center justify-center hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            <Send className="w-5 h-5 ml-1" />
          </button>
        </form>
      </div>
    </div>
  );
}
