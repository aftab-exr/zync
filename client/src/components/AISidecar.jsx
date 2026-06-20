import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Send, Trash2, Square, Loader2, Bot, User, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-python';

import { useAIStore } from '../store/useAIStore';
import { useMotion } from '../lib/motion';

function PrismBlock({ language, code }) {
  const [copied, setCopied] = useState(false);
  const lang = language || 'text';

  const html = useMemo(() => {
    const grammar = Prism.languages[lang];
    if (!grammar) return null;
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
    <div className="relative my-3 rounded-lg overflow-hidden border-3 border-border bg-surface shadow-brutal-sm">
      <div className="flex items-center justify-between px-3 py-1.5 bg-base border-b-3 border-border">
        <span className="text-[10px] font-mono uppercase tracking-wider text-tx-secondary font-bold">{lang}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-tx-secondary hover:text-tx-primary font-bold transition-colors"
        >
          {copied ? <Check className="w-3 h-3 text-success font-bold" /> : <Copy className="w-3 h-3 text-tx-secondary" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className={`language-${lang} p-3 overflow-x-auto text-[12.5px] leading-relaxed m-0 bg-zinc-900 text-zinc-100`}>
        {html
          ? <code className={`language-${lang}`} dangerouslySetInnerHTML={{ __html: html }} />
          : <code className={`language-${lang}`}>{code}</code>}
      </pre>
    </div>
  );
}

const markdownComponents = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '');
    const raw = String(children ?? '');
    if (match) {
      return <PrismBlock language={match[1]} code={raw.replace(/\n$/, '')} />;
    }
    return (
      <code className="bg-base text-accent px-1.5 py-0.5 rounded text-[12.5px] font-mono border-2 border-border font-bold" {...props}>
        {children}
      </code>
    );
  },
};

function MessageBubble({ role, content, streaming }) {
  const isUser = role === 'user';
  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border-2 border-border font-bold shadow-brutal-sm ${isUser ? 'bg-accent' : 'bg-primary'}`}>
        {isUser ? <User className="w-4 h-4 text-tx-primary" /> : <Bot className="w-4 h-4 text-tx-primary" />}
      </div>
      <div className={`max-w-[85%] rounded-lg px-3.5 py-2 text-sm border-3 border-border shadow-brutal-sm ${isUser ? 'bg-accent text-tx-primary' : 'bg-surface text-tx-primary'}`}>
        {content ? (
          <div className="prose prose-sm max-w-none break-words prose-p:my-1 prose-pre:my-0 prose-pre:bg-transparent prose-pre:p-0 prose-strong:font-bold prose-strong:text-tx-primary">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {content}
            </ReactMarkdown>
          </div>
        ) : (
          streaming && (
            <span className="inline-flex gap-1 py-1">
              <span className="w-1.5 h-1.5 bg-tx-secondary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-tx-secondary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-tx-secondary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [aiMessages, isOpen]);

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
          <motion.div
            variants={M.backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={closePanel}
            className="fixed inset-0 z-40 bg-black/40 md:bg-transparent"
          />

          <motion.aside
            variants={M.drawerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed top-0 right-0 z-50 h-[100dvh] w-full max-w-md flex flex-col bg-surface border-l-3 border-border shadow-brutal"
          >
            {/* Header */}
            <header className="h-14 flex items-center justify-between px-4 border-b-3 border-border bg-base shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent" />
                <h2 className="text-sm font-display font-bold tracking-wide text-tx-primary uppercase">AI Sidecar</h2>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={clearAiHistory}
                  title="Clear AI history"
                  className="p-2 rounded-lg border-3 border-transparent hover:border-border hover:bg-surface text-tx-secondary hover:text-secondary hover:shadow-brutal-sm transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={closePanel}
                  title="Close"
                  className="p-2 rounded-lg border-3 border-transparent hover:border-border hover:bg-surface text-tx-secondary hover:text-tx-primary hover:shadow-brutal-sm transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </header>

            {/* Transcript */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-base">
              {aiMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-3">
                  <div className="w-14 h-14 rounded-lg bg-surface border-3 border-border flex items-center justify-center shadow-brutal">
                    <Bot className="w-7 h-7 text-accent" />
                  </div>
                  <p className="text-sm text-tx-primary font-bold">Your private coding companion</p>
                  <p className="text-xs text-tx-secondary max-w-xs font-semibold">
                    Ask anything, or forward a code block from a chat to debug it instantly.
                  </p>
                  {!aiApiKey && (
                    <p className="text-[11px] text-secondary font-bold mt-1">
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
                <p className="text-[11px] text-secondary font-mono font-bold text-center">{aiError}</p>
              )}
            </div>

            {/* Composer */}
            <div className="p-3 border-t-3 border-border bg-surface shrink-0">
              <div className="flex items-end gap-2 bg-base border-3 border-border rounded-lg p-1.5 focus-within:border-accent transition-colors shadow-brutal-sm">
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
                  className="flex-1 max-h-40 min-h-[40px] bg-transparent text-sm text-tx-primary placeholder-tx-secondary resize-none focus:outline-none py-2 px-2 font-body"
                />
                {isStreaming ? (
                  <button
                    onClick={stopStreaming}
                    title="Stop generating"
                    className="w-10 h-10 rounded-lg bg-surface border-3 border-border text-tx-primary flex items-center justify-center hover:bg-base hover:text-secondary hover:border-secondary transition-all flex-shrink-0 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none shadow-brutal-sm"
                  >
                    <Square className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!inputDraft.trim()}
                    className="w-10 h-10 rounded-lg bg-accent text-tx-primary border-3 border-border flex items-center justify-center hover:bg-accent-hover transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none shadow-brutal-sm"
                  >
                    <Send className="w-4 h-4" />
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
