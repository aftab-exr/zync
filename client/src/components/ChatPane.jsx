import { useCallStore } from "../store/useCallStore";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Send, Users, Sparkles, ShieldCheck, Copy, Check, CheckCheck, ChevronLeft, Loader2, Video, Phone, Paperclip, Mic, ShieldAlert, Clock } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { useMessageStore } from "../store/useMessageStore";
import { useSettingsStore, resolveBackgroundStyle } from "../store/useSettingsStore";
import { auth } from "../lib/firebase";
import { compressIfImage, encryptFile, uploadEncryptedBlob, fetchAndDecrypt } from "../lib/media";
import { deriveConversationKey } from "../lib/mediaKeys";
import VoiceRecorder from "./VoiceRecorder";

// ⚡ PHASE 2: Strict ceiling for any encrypted attachment (image / video / voice).
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024; // 50MB

// ⚡ PHASE 2: Renders an encrypted attachment. Fetches the raw ciphertext blob
// from Cloudinary, decrypts it locally with the conversation key, and renders a
// `blob:` URL as <img>/<video>/<audio>. The plaintext never touches the network.
const EncryptedMedia = ({ url, type, mime, convKey }) => {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!convKey || !url) return;

    let active = true;
    let createdUrl = null;

    fetchAndDecrypt(url, convKey, mime)
      .then((blobUrl) => {
        if (active) {
          createdUrl = blobUrl;
          setSrc(blobUrl);
        } else {
          URL.revokeObjectURL(blobUrl);
        }
      })
      .catch((err) => {
        console.error("🔴 Failed to decrypt attachment:", err);
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [url, mime, convKey]);

  if (failed) {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] py-3 px-1">
        <ShieldAlert className="w-4 h-4 text-[var(--warning)]" /> Unable to decrypt media
      </div>
    );
  }

  if (!src) {
    return (
      <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-secondary)] py-8 px-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Decrypting…
      </div>
    );
  }

  if (type === "image") {
    return <img src={src} alt="Encrypted attachment" className="w-full h-auto max-h-[320px] object-cover rounded-xl" loading="lazy" />;
  }
  if (type === "video") {
    return <video src={src} controls className="w-full max-h-[320px] rounded-xl bg-black" />;
  }
  if (type === "audio") {
    return <audio src={src} controls className="w-[230px] max-w-full" />;
  }
  return <a href={src} download className="text-sm underline">Download file</a>;
};

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

export default function ChatPane({ conversationId, isSidecar = false }) {
  const [text, setText] = useState("");

  // ⚡ PHASE 2: Encrypted media state
  const attachInputRef = useRef(null);
  const [mediaStatus, setMediaStatus] = useState(null); // "Encrypting…" | "Uploading…" | "Sending…"
  const [isRecording, setIsRecording] = useState(false);
  const [convKey, setConvKey] = useState(null); // AES-GCM CryptoKey for this conversation

  const messagesEndRef = useRef(null);
  // ✅ BLUE TICK PROTOCOL: feed container + per-conversation dedupe set
  const feedRef = useRef(null);
  const markedReadRef = useRef(new Set());
  const navigate = useNavigate();
  
  const { authUser, user } = useAuthStore();
  const currentUser = authUser || user;

  // ⚡ ZERO-COST UI: locally-persisted chat background (no backend involved).
  const { chatBackground, backgroundType } = useSettingsStore();
  const backgroundStyle = useMemo(
    () => resolveBackgroundStyle(chatBackground, backgroundType),
    [chatBackground, backgroundType]
  );

  const { conversations } = useChatStore();
  const {
    messages,
    fetchMessages,
    sendMessage,
    sendAttachmentMessage,
    subscribeToMessages,
    unsubscribeFromMessages,
    markMessagesAsRead,
    isFetching,
    isSending,
    typingConversations
  } = useMessageStore();

  // ⚡ Extract Context & Dynamically find the other user
  const activeConversation = conversations.find(c => c._id === conversationId);
  const displayUser = activeConversation?.otherUser || activeConversation?.participants?.find(p => p._id !== currentUser?._id);
  const isGroup = activeConversation?.isGroup;
  const isOnline = displayUser?.status?.online;
  const isSomeoneTyping = typingConversations[conversationId];

  const processedMessages = useMemo(() => {
    return messages.map((msg) => {
      const isMine = msg.senderId === currentUser?._id;
      const sender = isGroup && !isMine 
        ? activeConversation?.participants?.find(p => p._id === msg.senderId)
        : null;
      return {
        ...msg,
        isMine,
        sender,
      };
    });
  }, [messages, currentUser?._id, activeConversation, isGroup]);

  // ⚡ PHASE 2: Derive the conversation's AES-GCM key (same key used for text) so
  // we can encrypt outgoing media and decrypt incoming media locally.
  useEffect(() => {
    let active = true;
    // Reset so we never decrypt the new conversation's media with a stale key.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConvKey(null);
    if (activeConversation && currentUser) {
      deriveConversationKey(activeConversation, currentUser)
        .then((key) => { if (active) setConvKey(key); })
        .catch((err) => console.error("🔴 Failed to derive conversation key:", err));
    }
    return () => { active = false; };
  }, [activeConversation, currentUser]);

  // ⚡ PHASE 2: The encrypt → upload → send pipeline for any binary attachment.
  const processAndSend = useCallback(async (file, type) => {
    if (!convKey) {
      toast.error("Secure channel isn't ready yet. Try again in a moment.");
      return;
    }
    // ⚡ HARD CAP: reject oversized payloads BEFORE encryptFile loads the whole
    // file into memory — guards mobile browsers from OOM crashes on large media.
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error("File exceeds 50MB limit");
      return;
    }
    try {
      setMediaStatus("Encrypting…");
      const processed = type === "image" ? await compressIfImage(file) : file;
      const mime = processed.type || file.type || (type === "audio" ? "audio/webm" : "application/octet-stream");

      const encryptedBlob = await encryptFile(processed, convKey);

      setMediaStatus("Uploading…");
      const token = await auth.currentUser.getIdToken();
      const url = await uploadEncryptedBlob(encryptedBlob, token);
      if (!url) throw new Error("Upload returned no URL");

      setMediaStatus("Sending…");
      const ok = await sendAttachmentMessage(conversationId, { url, type, mime }, "", displayUser?._id);
      if (!ok) throw new Error("Send failed");
    } catch (err) {
      console.error("🔴 Encrypted media send failed:", err);
      toast.error("Failed to send attachment.");
    } finally {
      setMediaStatus(null);
    }
  }, [convKey, conversationId, displayUser, sendAttachmentMessage]);

  const handleAttachmentSelect = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      toast.error("Only images and videos are supported.");
      return;
    }
    // Size enforcement is centralized in processAndSend (also covers voice notes).
    await processAndSend(file, isImage ? "image" : "video");
  }, [processAndSend]);

  const handleVoiceSend = useCallback(async (blob, mime) => {
    setIsRecording(false);
    const file = new File([blob], "voice-note", { type: mime || blob.type || "audio/webm" });
    await processAndSend(file, "audio");
  }, [processAndSend]);

  const handleSend = useCallback(async (e) => {
    e.preventDefault();
    if (!text.trim() || isSending) return;

    const currentText = text.trim();

    // Clear the composer immediately — the message now lives in the feed as an
    // optimistic bubble (rendered before the network call inside sendMessage).
    setText("");

    // ⚡ PHASE 3.5: a falsy result means the send failed (e.g. offline). We do NOT
    // restore the composer text anymore — the message is already painted as a
    // `pending` bubble and will auto-replay on reconnect, so re-inserting it here
    // would duplicate it. Send the encrypted text payload (media → processAndSend).
    await sendMessage(conversationId, currentText, null, displayUser?._id);
  }, [text, isSending, sendMessage, conversationId, displayUser?._id]);

  // Lifecycle
  useEffect(() => {
    if (conversationId) {
      fetchMessages(conversationId);
      subscribeToMessages(conversationId);
    }
    return () => unsubscribeFromMessages();
  }, [conversationId, fetchMessages, subscribeToMessages, unsubscribeFromMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSomeoneTyping]);

  // ✅ BLUE TICK PROTOCOL: reset the dedupe set when the chat changes
  useEffect(() => {
    markedReadRef.current = new Set();
  }, [conversationId]);

  // ✅ BLUE TICK PROTOCOL: The Viewport Interceptor
  // Watches unread incoming bubbles; when one scrolls into view, fire the read event.
  useEffect(() => {
    if (!conversationId || !feedRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const newlyRead = [];

        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = entry.target.dataset.messageId;
          if (id && !markedReadRef.current.has(id)) {
            markedReadRef.current.add(id);
            newlyRead.push(id);
            observer.unobserve(entry.target);
          }
        });

        if (newlyRead.length > 0) {
          markMessagesAsRead(conversationId, newlyRead, displayUser?._id);
        }
      },
      { root: feedRef.current, threshold: 0.6 }
    );

    // Only observe the other user's still-unread bubbles.
    const nodes = feedRef.current.querySelectorAll('[data-unread="true"]');
    nodes.forEach((node) => observer.observe(node));

    return () => observer.disconnect();
  }, [conversationId, messages, markMessagesAsRead, displayUser?._id]);

  if (isFetching && messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col h-full bg-[var(--bg-base)] items-center justify-center">
        <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--bg-base)] overflow-hidden" style={backgroundStyle}>

      {/* ⚡ HEADER */}
      <div className="h-14 flex items-center justify-between px-4 md:px-6 border-b border-[var(--border)] bg-[var(--bg-surface)] shrink-0 z-10 relative">
        <div className="flex items-center gap-3">
          {!isSidecar && (
            <button 
              onClick={() => navigate('/inbox')}
              className="md:hidden p-2 -ml-2 text-[var(--text-secondary)] hover:text-white transition-colors"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

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
          <div className="flex items-center gap-2 md:gap-4">
            
            {/* ⚡ PHASE 4: WebRTC Voice Call */}
            <button
              onClick={() => useCallStore.getState().initiateCall(displayUser, 'audio')}
              className="p-2 w-9 h-9 rounded-full bg-[var(--bg-raised)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-all flex items-center justify-center active:scale-95 shadow-sm"
              title="Start Voice Call"
            >
              <Phone className="w-4 h-4" />
            </button>

            {/* ⚡ PHASE 2.2 / 4: WebRTC Video Call */}
            <button
              onClick={() => useCallStore.getState().initiateCall(displayUser, 'video')}
              className="p-2 w-9 h-9 rounded-full bg-[var(--bg-raised)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-all flex items-center justify-center active:scale-95 shadow-sm"
              title="Start Video Call"
            >
              <Video className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1.5 text-xs text-[var(--success)] px-3 py-1.5 rounded-full bg-[var(--bg-raised)] border border-[var(--border)] hidden md:flex shadow-sm">
              <ShieldCheck className="w-4 h-4" />
              <span>End-to-End Encrypted</span>
            </div>
          </div>
        )}
      </div>

      {/* ⚡ MESSAGE FEED */}
      <div ref={feedRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 overflow-x-hidden relative">
        <AnimatePresence initial={false}>
          {processedMessages.map((msg, index) => {
            return (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                key={msg._id || index}
                data-message-id={msg._id}
                data-unread={(!msg.isMine && !msg.isRead) ? "true" : "false"}
                className={`flex flex-col ${msg.isMine ? 'items-end origin-bottom-right' : 'items-start origin-bottom-left'}`}
              >
                
                {isGroup && !msg.isMine && msg.sender && (
                  <span className="text-xs text-[var(--text-secondary)] mb-1 ml-1 font-medium">
                    {msg.sender.displayName}
                  </span>
                )}

                <div className={`max-w-[85%] md:max-w-[70%] rounded-2xl p-2.5 shadow-sm transition-opacity ${
                  msg.isMine
                    ? 'bg-[var(--accent)] text-white rounded-br-sm'
                    : 'bg-[var(--bg-raised)] border border-[var(--border)] text-white rounded-bl-sm'
                } ${msg.status === 'pending' ? 'opacity-70' : ''}`}>
                  
                  {/* ⚡ PHASE 2: Encrypted attachment (image / video / voice note) */}
                  {msg.attachmentUrl && (
                    <div className="relative rounded-xl overflow-hidden mb-2 min-w-[180px]">
                      <EncryptedMedia
                        url={msg.attachmentUrl}
                        type={msg.attachmentType}
                        mime={msg.attachmentMime}
                        convKey={convKey}
                      />
                    </div>
                  )}

                  {/* ⚡ PHASE 2.1: Render the image if it exists */}
                  {msg.imageUrl && (
                    <div className="relative rounded-xl overflow-hidden mb-2 border border-black/10">
                      <img
                        src={msg.imageUrl}
                        alt="Attachment"
                        className="w-full h-auto max-h-[300px] object-cover"
                        loading="lazy"
                      />
                    </div>
                  )}

                  {/* Render the text if it exists */}
                  {msg.text && (
                    <div className={`px-2 pb-1 prose prose-sm max-w-none break-words ${msg.isMine ? 'prose-invert prose-p:text-white' : 'dark:prose-invert'}`}>
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]} 
                        components={{ code: CodeBlock }}
                      >
                        {msg.text}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-1 mt-1 text-[11px] text-[var(--text-secondary)] font-mono">
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {msg.isMine && (
                    msg.status === 'pending' ? (
                      // ⚡ PHASE 3.5: queued offline — not yet on the server.
                      <Clock className="w-3 h-3 text-[var(--text-secondary)] ml-1" title="Sending…" />
                    ) : msg.isRead ? (
                      <CheckCheck className="w-3.5 h-3.5 text-[var(--accent)] ml-1 transition-colors duration-300" />
                    ) : (
                      <Check className="w-3 h-3 text-[var(--text-secondary)] ml-1 transition-colors duration-300" />
                    )
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {isSomeoneTyping && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
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

        <div ref={messagesEndRef} />
      </div>

      {/* ⚡ COMPOSER */}
      <div className="p-3 md:p-4 bg-[var(--bg-surface)] border-t border-[var(--border)] shrink-0 relative z-20">
        <form onSubmit={handleSend} className="flex flex-col gap-2 max-w-4xl mx-auto relative">

          {/* ⚡ PHASE 2: Encrypt/upload status indicator */}
          <AnimatePresence>
            {mediaStatus && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="w-full flex items-center gap-2 bg-[var(--bg-raised)] border border-[var(--border)] rounded-2xl px-4 py-2.5 text-sm text-[var(--text-secondary)]"
              >
                <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
                <span>{mediaStatus}</span>
                <ShieldCheck className="w-4 h-4 text-[var(--success)] ml-auto" />
              </motion.div>
            )}
          </AnimatePresence>

          {isRecording ? (
            <VoiceRecorder
              onSend={handleVoiceSend}
              onCancel={() => setIsRecording(false)}
              busy={!!mediaStatus}
            />
          ) : (
          <div className="flex items-end gap-2 w-full">
            <div className="flex-1 bg-[var(--bg-base)] border border-[var(--border)] rounded-2xl p-1 flex items-center focus-within:border-[var(--accent)] transition-colors shadow-sm">

              {/* ⚡ PHASE 2: Encrypted attachment (image / video) */}
              <input
                type="file"
                accept="image/*,video/*"
                className="hidden"
                ref={attachInputRef}
                onChange={handleAttachmentSelect}
              />
              <button
                type="button"
                title="Encrypted attachment"
                disabled={!!mediaStatus}
                className="p-3 text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors rounded-xl active:scale-95 disabled:opacity-40"
                onClick={() => attachInputRef.current?.click()}
              >
                <Paperclip className="w-5 h-5" />
              </button>

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
                className="w-full max-h-32 min-h-[44px] bg-transparent text-sm text-white resize-none focus:outline-none py-3 px-2 font-body"
                rows={1}
              />
            </div>

            {/* ⚡ PHASE 2: Voice note when empty, Send when composing */}
            {!text.trim() ? (
              <button
                type="button"
                title="Record voice note"
                disabled={!!mediaStatus}
                onClick={() => setIsRecording(true)}
                className="w-12 h-12 rounded-full bg-[var(--bg-raised)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] flex items-center justify-center transition-all flex-shrink-0 active:scale-95 disabled:opacity-50 shadow-sm"
              >
                <Mic className="w-5 h-5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!text.trim() || isSending}
                className="w-12 h-12 rounded-full bg-[var(--accent)] text-white flex items-center justify-center hover:bg-[var(--accent-hover)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 active:scale-95 shadow-md"
              >
                {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-1" />}
              </button>
            )}
          </div>
          )}

        </form>
      </div>
      
    </div>
  );
}