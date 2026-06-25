import { useCallStore } from "../store/useCallStore";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Send, Users, Sparkles, ShieldCheck, Copy, Check, CheckCheck, ChevronLeft, Loader2, Video, Phone, Paperclip, Mic, ShieldAlert, Clock, Bot, MoreVertical, Edit2, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { useMessageStore } from "../store/useMessageStore";
import { useSocketStore } from "../store/useSocketStore";
import { useAIStore } from "../store/useAIStore";
import { useSettingsStore, resolveBackgroundStyle } from "../store/useSettingsStore";
import { auth } from "../lib/firebase";
import { compressIfImage, encryptFile, uploadEncryptedBlob, fetchAndDecrypt } from "../lib/media";
import { deriveConversationKey } from "../lib/mediaKeys";
import VoiceRecorder from "./VoiceRecorder";
import { useMotion } from "../lib/motion";
import { ChatFeedSkeleton } from "../components/Skeletons";

const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024; // 50MB

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
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [url, mime, convKey]);

  if (failed) {
    return (
      <div className="flex items-center gap-2 text-xs text-tx-secondary py-3 px-1 font-bold">
        <ShieldAlert className="w-4 h-4 text-secondary" /> Unable to decrypt media
      </div>
    );
  }

  if (!src) {
    return (
      <div className="flex items-center justify-center gap-2 text-xs text-tx-secondary py-8 px-6 font-bold">
        <Loader2 className="w-4 h-4 animate-spin" /> Decrypting…
      </div>
    );
  }

  if (type === "image") {
    return <img src={src} alt="Encrypted attachment" className="w-full h-auto max-h-[320px] object-cover rounded-lg border-3 border-border shadow-brutal-sm" loading="lazy" />;
  }
  if (type === "video") {
    return <video src={src} controls className="w-full max-h-[320px] rounded-lg bg-black border-3 border-border shadow-brutal-sm" />;
  }
  if (type === "audio") {
    return <audio src={src} controls className="w-[230px] max-w-full rounded-lg border-3 border-border bg-base p-1.5 shadow-brutal-sm" />;
  }
  return <a href={src} download className="text-sm underline font-bold text-tx-primary">Download file</a>;
};

const CodeBlock = ({ inline, className, children, ...props }) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');

  const handleCopy = () => {
    navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!inline && match) {
    const codeText = String(children).replace(/\n$/, '');
    return (
      <div className="relative mt-4 mb-4 rounded-lg overflow-hidden bg-surface border-3 border-border shadow-brutal-sm">
        <div className="flex items-center justify-between px-4 py-2 bg-base border-b-3 border-border">
          <span className="text-xs font-mono text-tx-secondary uppercase tracking-wider font-bold">{match[1]}</span>
          <div className="flex items-center gap-3 font-bold">
            <button
              onClick={() => useAIStore.getState().forwardToAi(codeText)}
              title="Forward to AI Sidecar"
              className="flex items-center gap-1.5 text-xs text-tx-secondary hover:text-accent transition-colors font-bold"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Ask AI</span>
            </button>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-xs text-tx-secondary hover:text-tx-primary transition-colors font-bold"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-success font-bold" />
                  <span className="text-success font-bold">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-tx-secondary" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>
        <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed text-tx-primary font-mono m-0 bg-zinc-900 text-zinc-100">
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      </div>
    );
  }

  return (
    <code className="bg-base text-accent px-1.5 py-0.5 rounded-lg text-sm font-mono border-2 border-border font-bold" {...props}>
      {children}
    </code>
  );
};

export default function ChatPane({ conversationId, isSidecar = false }) {
  const M = useMotion();
  const [text, setText] = useState("");
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);

  const getMessageText = (msg) => {
    if (msg.isDecrypted === true) return msg.text;
    if (!msg.text) return "";
    try {
      if (msg.text.includes('"iv"') && msg.text.includes('"ciphertext"')) {
        return "🔒 [Encrypted Message - Awaiting Key Sync]";
      }
    } catch (e) {
      // Failed to parse
    }
    return msg.text;
  };

  const attachInputRef = useRef(null);
  const [mediaStatus, setMediaStatus] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [convKey, setConvKey] = useState(null);

  const messagesEndRef = useRef(null);
  const feedRef = useRef(null);
  const markedReadRef = useRef(new Set());
  const lastFetchedIdRef = useRef(null);
  const navigate = useNavigate();
  
  const { authUser, user } = useAuthStore();
  const currentUser = authUser || user;

  const { chatBackground } = useSettingsStore();
  const backgroundStyle = useMemo(
    () => resolveBackgroundStyle(chatBackground),
    [chatBackground]
  );

  const { conversations, isFetchingConversations } = useChatStore();
  const { onlineUsers } = useSocketStore();
  const {
    messages,
    fetchMessages,
    fetchMoreMessages,
    hasMore,
    sendMessage,
    editMessage,
    deleteMessageForMe,
    deleteMessageForEveryone,
    sendAttachmentMessage,
    subscribeToMessages,
    unsubscribeFromMessages,
    markMessagesAsRead,
    isFetching,
    isSending,
    typingConversations
  } = useMessageStore();

  const activeConversation = conversations.find(c => c._id === conversationId);
  const displayUser = activeConversation?.otherUser || activeConversation?.participants?.find(p => p._id !== currentUser?._id);
  const isGroup = activeConversation?.isGroup;
  const isOnline = onlineUsers.includes(String(displayUser?._id));
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

  useEffect(() => {
    let active = true;
    setConvKey(null);
    if (activeConversation && currentUser) {
      deriveConversationKey(activeConversation, currentUser)
        .then((key) => { if (active) setConvKey(key); })
        .catch((err) => {});
    }
    return () => { active = false; };
  }, [activeConversation, currentUser]);

  const processAndSend = useCallback(async (file, type) => {
    if (!convKey) {
      toast.error("Secure channel isn't ready yet. Try again in a moment.");
      return;
    }
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
    setText("");

    if (editingMessage) {
      const msgId = editingMessage._id;
      setEditingMessage(null);
      await editMessage(msgId, currentText);
    } else {
      await sendMessage(conversationId, currentText, null, displayUser?._id);
    }
  }, [text, isSending, sendMessage, editMessage, editingMessage, conversationId, displayUser?._id]);

  useEffect(() => {
    if (!conversationId) return;
    if (conversationId === lastFetchedIdRef.current) return;
    lastFetchedIdRef.current = conversationId;

    let isMounted = true;

    const loadChat = async () => {
      await fetchMessages(conversationId);

      if (isMounted) {
        subscribeToMessages(conversationId);
      }
    };

    loadChat();

    return () => {
      isMounted = false;
      unsubscribeFromMessages();
    };
  }, [conversationId, fetchMessages, subscribeToMessages, unsubscribeFromMessages]);
  const [loadingMore, setLoadingMore] = useState(false);

  const handleScroll = async (e) => {
    const { scrollTop } = e.currentTarget;
    if (scrollTop === 0 && !loadingMore && hasMore && messages.length > 0) {
      setLoadingMore(true);
      const oldScrollHeight = feedRef.current.scrollHeight;
      try {
        await fetchMoreMessages(conversationId);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingMore(false);
      }
      if (feedRef.current) {
        feedRef.current.scrollTop = feedRef.current.scrollHeight - oldScrollHeight;
      }
    }
  };
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSomeoneTyping]);

  useEffect(() => {
    markedReadRef.current = new Set();
  }, [conversationId]);

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

    const nodes = feedRef.current.querySelectorAll('[data-unread="true"]');
    nodes.forEach((node) => observer.observe(node));

    return () => observer.disconnect();
  }, [conversationId, messages, markMessagesAsRead, displayUser?._id]);

  // 1. Wait for the conversation list to hydrate before mapping users
  if (isFetchingConversations || (!activeConversation && conversations.length === 0)) {
    return (
      <div className="flex-1 flex flex-col h-full bg-base overflow-hidden">
         <ChatFeedSkeleton />
      </div>
    );
  }

  // 2. If fetching is done and conversation STILL doesn't exist, block access
  if (!activeConversation) {
    return (
      <div className="flex-1 flex flex-col h-full bg-base items-center justify-center text-tx-secondary font-bold">
         Conversation not found.
      </div>
    );
  }

  if (isFetching && messages.length === 0) {
    return <ChatFeedSkeleton />;
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-base overflow-hidden" style={backgroundStyle}>

      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 md:px-6 border-b-3 border-border bg-surface shrink-0 z-10 relative">
        <div className="flex items-center gap-3">
          {!isSidecar && (
            <button 
              onClick={() => navigate('/inbox')}
              className="md:hidden p-2 -ml-2 text-tx-secondary hover:text-tx-primary border-3 border-transparent hover:border-border hover:bg-base rounded-lg transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none hover:shadow-brutal-sm"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          <div className="relative">
            {isGroup ? (
              <div className="w-9 h-9 rounded-lg bg-accent border-2 border-border text-tx-primary flex items-center justify-center shadow-brutal-sm">
                <Users className="w-4 h-4 text-tx-primary" />
              </div>
            ) : (
              <div className="w-9 h-9 rounded-lg bg-primary border-2 border-border flex items-center justify-center font-display font-bold text-sm text-tx-primary overflow-hidden shadow-brutal-sm">
                {displayUser?.avatarUrl ? (
                  <img src={displayUser.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  displayUser?.displayName?.charAt(0).toUpperCase()
                )}
              </div>
            )}
            {!isGroup && isOnline && (
              <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-success border-2 border-border rounded-full"></span>
            )}
          </div>

          <div>
            <h2 className="text-[15px] font-bold text-tx-primary flex items-center gap-1.5 leading-tight">
              {displayUser?.displayName || "Unknown"}
              {!isGroup && displayUser?.isAI && <Sparkles className="w-3.5 h-3.5 text-accent animate-pulse" />}
            </h2>
            <p className="text-xs text-tx-secondary font-mono font-bold">
              {isGroup ? displayUser?.username : (displayUser?.isAI ? 'Quantum Processing Active' : (isOnline ? 'Online' : 'Offline'))}
            </p>
          </div>
        </div>
        
        {!isGroup && !displayUser?.isAI && (
          <div className="flex items-center gap-2 md:gap-4">
            
            {/* Call Voice button */}
            <button
              onClick={() => useCallStore.getState().initiateCall(displayUser, 'audio')}
              className="p-2 w-9 h-9 rounded-lg bg-surface border-3 border-border text-tx-primary hover:bg-base hover:shadow-brutal-sm transition-all flex items-center justify-center active:translate-x-0.5 active:translate-y-0.5 active:shadow-none shadow-brutal-sm"
              title="Start Voice Call"
            >
              <Phone className="w-4 h-4 text-tx-primary" />
            </button>

            {/* Call Video button */}
            <button
              onClick={() => useCallStore.getState().initiateCall(displayUser, 'video')}
              className="p-2 w-9 h-9 rounded-lg bg-surface border-3 border-border text-tx-primary hover:bg-base hover:shadow-brutal-sm transition-all flex items-center justify-center active:translate-x-0.5 active:translate-y-0.5 active:shadow-none shadow-brutal-sm"
              title="Start Video Call"
            >
              <Video className="w-4 h-4 text-tx-primary" />
            </button>

            <div className="flex items-center gap-1.5 text-xs text-success px-3 py-1.5 rounded-lg bg-surface border-3 border-border font-bold shadow-brutal-sm hidden md:flex">
              <ShieldCheck className="w-4 h-4 text-success" />
              <span>E2EE Secure</span>
            </div>
          </div>
        )}
      </div>

      {/* Message Feed */}
      <div 
        ref={feedRef} 
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 overflow-x-hidden relative"
      >
        <AnimatePresence initial={false}>
          {processedMessages.map((msg, index) => {
            if (msg.messageType === "call_log") {
              return (
                <motion.div
                  variants={M.messageBubbleVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  key={msg._id || index}
                  data-message-id={msg._id}
                  className="w-full flex justify-center py-2"
                >
                  <div className="bg-surface border-3 border-border px-4 py-2 rounded-lg text-xs font-bold text-tx-secondary shadow-brutal-sm flex items-center gap-2 max-w-[85%] sm:max-w-[70%]">
                    <span>{msg.text}</span>
                    <span className="text-[10px] opacity-70 font-mono">
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </motion.div>
              );
            }

            return (
              <motion.div
                variants={M.messageBubbleVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                key={msg._id || index}
                data-message-id={msg._id}
                data-unread={(!msg.isMine && !msg.isRead) ? "true" : "false"}
                className={`flex flex-col ${msg.isMine ? 'items-end origin-bottom-right' : 'items-start origin-bottom-left'}`}
              >
                
                {isGroup && !msg.isMine && msg.sender && (
                  <span className="text-xs text-tx-secondary mb-1 ml-1 font-bold">
                    {msg.sender.displayName}
                  </span>
                )}

                <div className={`flex items-center gap-2 group relative max-w-[85%] md:max-w-[70%] ${
                  msg.isMine ? 'flex-row-reverse' : 'flex-row'
                }`}>
                  <div className={`rounded-lg p-2.5 border-3 border-border shadow-brutal-sm transition-all font-semibold ${
                    msg.isMine
                      ? 'bg-accent text-tx-primary'
                      : 'bg-surface text-tx-primary'
                  } ${msg.status === 'pending' ? 'opacity-70' : ''}`}>
                    
                    {msg.deletedForEveryone ? (
                      <div className="px-2 py-1 text-sm italic text-tx-secondary flex items-center gap-1.5 font-bold">
                        <span>🚫 Message deleted</span>
                      </div>
                    ) : (
                      <>
                        {msg.attachmentUrl && (
                          <div className="relative rounded-lg overflow-hidden mb-2 min-w-[180px]">
                            <EncryptedMedia
                              url={msg.attachmentUrl}
                              type={msg.attachmentType}
                              mime={msg.attachmentMime}
                              convKey={convKey}
                            />
                          </div>
                        )}

                        {msg.imageUrl && (
                          <div className="relative rounded-lg overflow-hidden mb-2 border-3 border-border shadow-brutal-sm bg-base">
                            <img
                              src={msg.imageUrl}
                              alt="Attachment"
                              className="w-full h-auto max-h-[300px] object-cover"
                              loading="lazy"
                            />
                          </div>
                        )}

                        {msg.text && (
                          <div className="px-2 pb-1 prose prose-sm max-w-none break-words prose-p:text-tx-primary prose-strong:font-bold prose-strong:text-tx-primary">
                            <ReactMarkdown 
                              remarkPlugins={[remarkGfm]} 
                              components={{ code: CodeBlock }}
                            >
                              {getMessageText(msg)}
                            </ReactMarkdown>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {!msg.deletedForEveryone && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveDropdown(activeDropdown === msg._id ? null : msg._id);
                        }}
                        className="p-1.5 rounded-lg border-2 border-transparent hover:border-border hover:bg-surface text-tx-secondary hover:text-tx-primary transition-all active:translate-y-0.5 active:translate-x-0.5"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {activeDropdown === msg._id && (
                        <div className={`absolute top-6 ${msg.isMine ? 'right-0' : 'left-0'} z-50 bg-surface border-3 border-border shadow-brutal p-1.5 min-w-[150px] rounded-lg`}>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveDropdown(null);
                              deleteMessageForMe(msg._id);
                            }}
                            className="w-full text-left px-2.5 py-1.5 text-xs text-tx-primary font-bold hover:bg-base rounded flex items-center gap-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-error" />
                            <span>Delete for Me</span>
                          </button>

                          {msg.isMine && (Date.now() - new Date(msg.createdAt).getTime() < 900000) && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveDropdown(null);
                                  setEditingMessage(msg);
                                  setText(msg.text);
                                }}
                                className="w-full text-left px-2.5 py-1.5 text-xs text-tx-primary font-bold hover:bg-base rounded flex items-center gap-1.5"
                              >
                                <Edit2 className="w-3.5 h-3.5 text-accent" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveDropdown(null);
                                  deleteMessageForEveryone(msg._id);
                                }}
                                className="w-full text-left px-2.5 py-1.5 text-xs text-error font-bold hover:bg-base rounded flex items-center gap-1.5"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-error" />
                                <span>Delete for Everyone</span>
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-1 mt-1 text-[11px] text-tx-secondary font-mono font-bold">
                  {msg.text && !msg.deletedForEveryone && (msg.text.length > 80 || msg.text.includes('```')) && (
                    <button
                      onClick={() => useAIStore.getState().forwardToAi(msg.text)}
                      title="Forward to AI Sidecar"
                      className="mr-1 p-0.5 rounded text-tx-secondary opacity-60 hover:opacity-100 hover:text-accent transition-all"
                    >
                      <Bot className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {msg.isEdited && <span className="text-[10px] mr-1 opacity-70">(edited)</span>}
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {msg.isMine && (
                    msg.status === 'pending' ? (
                      <Clock className="w-3 h-3 text-tx-secondary ml-1" title="Sending…" />
                    ) : msg.isRead ? (
                      <CheckCheck className="w-3.5 h-3.5 text-accent ml-1 transition-colors duration-300" />
                    ) : (
                      <Check className="w-3 h-3 text-tx-secondary ml-1 transition-colors duration-300" />
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
            transition={M.transition}
            className="flex items-center gap-2 text-tx-secondary text-sm p-2"
          >
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-tx-secondary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-tx-secondary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-tx-secondary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-xs font-bold">typing...</span>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div className="p-3 md:p-4 bg-surface border-t-3 border-border shrink-0 relative z-20 shadow-brutal-lg">
        <form onSubmit={handleSend} className="flex flex-col gap-2 max-w-4xl mx-auto relative">

          <AnimatePresence>
            {mediaStatus && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={M.transition}
                className="w-full flex items-center gap-2 bg-base border-3 border-border rounded-lg px-4 py-2.5 text-sm text-tx-secondary font-bold shadow-brutal-sm"
              >
                <Loader2 className="w-4 h-4 animate-spin text-accent" />
                <span>{mediaStatus}</span>
                <ShieldCheck className="w-4 h-4 text-success ml-auto" />
              </motion.div>
            )}
            {editingMessage && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="w-full flex items-center justify-between bg-base border-3 border-border rounded-lg px-4 py-2 text-xs font-bold shadow-brutal-sm"
              >
                <div className="flex items-center gap-1.5">
                  <Edit2 className="w-3.5 h-3.5 text-accent" />
                  <span>Editing Message</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingMessage(null);
                    setText("");
                  }}
                  className="text-error hover:underline font-bold"
                >
                  Cancel
                </button>
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
            <div className="flex-1 bg-base border-3 border-border rounded-lg p-1 flex items-center focus-within:border-accent transition-colors shadow-brutal-sm">

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
                className="p-3 text-tx-secondary hover:text-tx-primary hover:bg-surface border-2 border-transparent hover:border-border hover:shadow-brutal-sm transition-all rounded-lg active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-40"
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
                placeholder={editingMessage ? "Edit message..." : (isGroup ? `Message ${displayUser?.displayName}...` : `Message @${displayUser?.username || ''}...`)}
                className="w-full max-h-32 min-h-[44px] bg-transparent text-sm text-tx-primary placeholder-tx-secondary resize-none focus:outline-none py-3 px-2 font-body font-semibold"
                rows={1}
              />
            </div>

            {!text.trim() ? (
              <button
                type="button"
                title="Record voice note"
                disabled={!!mediaStatus}
                onClick={() => setIsRecording(true)}
                className="w-12 h-12 rounded-lg bg-surface border-3 border-border text-tx-primary hover:bg-base flex items-center justify-center transition-all flex-shrink-0 shadow-brutal-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50"
              >
                <Mic className="w-5 h-5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!text.trim() || isSending}
                className="w-12 h-12 rounded-lg bg-accent text-tx-primary border-3 border-border flex items-center justify-center hover:bg-accent-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 shadow-brutal-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              >
                {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-1 text-tx-primary" />}
              </button>
            )}
          </div>
          )}

        </form>
      </div>
      
    </div>
  );
}