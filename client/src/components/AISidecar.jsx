import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Send, Trash2, Square, Loader2, Bot, User, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
// Core prismjs already ships markup/css/clike/javascript. Add the common extras
// a coding companion is likely to emit. Order matters — dependents come after
// their base grammar (tsx ⇐ jsx + typescript).
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-python';

import { useAIStore } from '../store/useAIStore';
import { useMotion } from '../lib/motion';

// ⚡ PHASE 5: Prism-highlighted fenced code block with a copy button. Falls back
// to plain (escaped) text when the language grammar isn't loaded.
function PrismBlock({ language, code }) {
  const [copied, setCopied] = useState(false);
  const lang = language || 'text';

  const html = useMemo(() => {
    const grammar = Prism.languages[lang];
    if (!grammar) return null; // unknown language → render as plain text
    try {
      return Prism.highlight(code, grammar, lang);
    } catch {
      return null;
    }
  }, [code, lang]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative my-3 rounded-lg overflow-hidden border border-border bg-surface">
      <div className="flex items-center justify-between px-3 py-1.5 bg-raised border-b border-border">
        <span className="text-[10px] font-mono uppercase tracking-wider text-tx-secondary">{lang}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-tx-secondary hover:text-tx-primary transition-colors"
        >
          {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className={`language-${lang} p-3 overflow-x-auto text-[12.5px] leading-relaxed m-0`}>
        {html
          ? <code className={`language-${lang}`} dangerouslySetInnerHTML={{ __html: html }} />
          : <code className={`language-${lang}`}>{code}</code>}
      </pre>
    </div>
  );
}

// react-markdown `code` renderer — fenced blocks go to PrismBlock, inline code
// stays a small pill. (react-markdown v10 drops the `inline` prop, so we detect
// blocks via the language-* className + presence of a newline.)
const markdownComponents = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '');
    const raw = String(children ?? '');
    if (match) {
      return <PrismBlock language={match[1]} code={raw.replace(/\n$/, '')} />;
    }
    return (
      <code className="bg-raised text-accent px-1.5 py-0.5 rounded text-[12.5px] font-mono border border-border" {...props}>
        {children}
      </code>
    );
  },
};

function MessageBubble({ role, content, streaming }) {
  const isUser = role === 'user';
  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${isUser ? 'bg-accent' : 'bg-raised border border-border'}`}>
        {isUser ? <User className="w-3.5 h-3.5 text-tx-primary" /> : <Bot className="w-3.5 h-3.5 text-accent" />}
      </div>
      <div className={`max-w-[85%] rounded-xl px-3.5 py-2 text-sm ${isUser ? 'bg-accent text-tx-primary rounded-tr-sm' : 'bg-raised border border-border text-tx-primary rounded-tl-sm'}`}>
        {content ? (
          <div className="prose prose-sm prose-invert max-w-none break-words prose-p:my-1 prose-pre:my-0 prose-pre:bg-transparent prose-pre:p-0">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {content}
            </ReactMarkdown>
          </div>
        ) : (
          streaming && (
            <span className="inline-flex gap-1 py-1">
              <span className="w-1.5 h-1.5 bg-[var(--text-tx-secondary)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-[var(--text-tx-secondary)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-[var(--text-tx-secondary)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          )
        )}
      </div>
    </div>
  );
}

export default function AISidecar() {
  const M = useMotion();
  const {
    isOpen, closePanel,
    aiMessages, isStreaming, aiError,
    inputDraft, setInputDraft,
    sendAiMessage, stopStreaming, clearAiHistory,
    aiApiKey,
  } = useAIStore();

  const scrollRef = useRef(null);
  const taRef = useRef(null);

  // Autoscroll as tokens stream in / messages append.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [aiMessages, isOpen]);

  // Focus the composer when the drawer opens (e.g. via Forward-to-AI).
  useEffect(() => {
    if (isOpen) taRef.current?.focus();
  }, [isOpen]);

  const handleSend = () => {
    const text = inputDraft.trim();
    if (!text || isStreaming) return;
    sendAiMessage(text);
  };

  const lastIndex = aiMessages.length - 1;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Click-away backdrop (subtle — the chat stays visible behind it). */}
          <motion.div
            variants={M.backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={closePanel}
            className="fixed inset-0 z-40 bg-black/30 md:bg-transparent"
          />

          <motion.aside
            variants={M.drawerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed top-0 right-0 z-50 h-[100dvh] w-full max-w-md flex flex-col bg-surface backdrop-blur-xl border-l border-border"
          >
            {/* Header */}
            <header className="h-14 flex items-center justify-between px-4 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent" />
                <h2 className="text-sm font-display font-bold tracking-wide text-tx-primary uppercase">AI Sidecar</h2>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={clearAiHistory}
                  title="Clear AI history"
                  className="p-2 rounded-lg text-tx-secondary hover:text-error transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={closePanel}
                  title="Close"
                  className="p-2 rounded-lg text-tx-secondary hover:text-tx-primary transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </header>

            {/* Transcript */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
              {aiMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-raised border border-border flex items-center justify-center">
                    <Bot className="w-7 h-7 text-accent" />
                  </div>
                  <p className="text-sm text-tx-primary font-medium">Your private coding companion</p>
                  <p className="text-xs text-tx-secondary max-w-xs">
                    Ask anything, or forward a code block from a chat to debug it instantly.
                  </p>
                  {!aiApiKey && (
                    <p className="text-[11px] text-warning mt-1">
                      ⚙️ Add an API key in Settings → AI Sidecar to begin.
                    </p>
                  )}
                </div>
              ) : (
                aiMessages.map((m, i) => (
                  <MessageBubble
                    key={i}
                    role={m.role}
                    content={m.content}
                    streaming={isStreaming && i === lastIndex}
                  />
                ))
              )}

              {aiError && (
                <p className="text-[11px] text-error font-mono text-center">{aiError}</p>
              )}
            </div>

            {/* Composer */}
            <div className="p-3 border-t border-border shrink-0">
              <div className="flex items-end gap-2 bg-base border border-border rounded-2xl p-1.5 focus-within:border-accent transition-colors">
                <textarea
                  ref={taRef}
                  value={inputDraft}
                  onChange={(e) => setInputDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  rows={1}
                  placeholder="Ask the AI Sidecar…"
                  className="flex-1 max-h-40 min-h-[40px] bg-transparent text-sm text-tx-primary resize-none focus:outline-none py-2 px-2 font-body"
                />
                {isStreaming ? (
                  <button
                    onClick={stopStreaming}
                    title="Stop generating"
                    className="w-10 h-10 rounded-full bg-raised border border-border text-tx-primary flex items-center justify-center hover:border-error hover:text-error transition-all flex-shrink-0 active:scale-95"
                  >
                    <Square className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!inputDraft.trim()}
                    className="w-10 h-10 rounded-full bg-accent text-tx-primary flex items-center justify-center hover:bg-accent-hover transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 active:scale-95"
                  >
                    {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
