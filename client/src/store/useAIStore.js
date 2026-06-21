import { create } from 'zustand';

/**
 * ⚡ ZYNC PHASE 5 — AI SIDECAR (OpenAI-compatible SSE streaming)
 *
 * 🔒 ISOLATION DIRECTIVE: this store is a COMPLETELY PARALLEL layer. It never
 * imports useMessageStore, the crypto lib, or any E2E key material — AI prompts
 * and completions travel straight to an external OpenAI-compatible endpoint over
 * plain HTTPS/SSE and never touch the encrypted-message pipeline. Keep it that
 * way: do not wire message keys, Dexie, or the socket into this file.
 *
 * Config (base URL / key / model) persists in localStorage so a developer's
 * private LM Studio / Ollama endpoint survives reloads.
 */

const LS_BASE_URL = 'zync_ai_base_url';
const LS_API_KEY = 'zync_ai_api_key';
const LS_MODEL = 'zync_ai_model';

// Cloud fallback defaults — point at Groq's OpenAI-compatible gateway with a
// fast, lightweight chat/coding model. A developer can override all three in
// Settings → AI Sidecar to target a local model instead.
const DEFAULT_BASE_URL = '/api/v1/ai';
const DEFAULT_MODEL = 'llama-3.1-8b-instant';

const readLS = (key, fallback) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};

const writeLS = (key, value) => {
  try {
    if (value == null || value === '') localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode / quota — config just won't persist, not fatal */
  }
};

// Module-scoped abort handle for the in-flight stream (kept out of state so a
// re-render never churns it). stopStreaming()/clearAiHistory() abort through it.
let activeController = null;

export const useAIStore = create((set, get) => ({
  // ── Config ────────────────────────────────────────────────────────────────
  aiBaseUrl: readLS(LS_BASE_URL, DEFAULT_BASE_URL),
  aiApiKey: readLS(LS_API_KEY, ''),
  aiModel: readLS(LS_MODEL, DEFAULT_MODEL),

  // ── Session ──────────────────────────────────────────────────────────────
  aiMessages: [],      // [{ role: 'user' | 'assistant', content: string }]
  isStreaming: false,
  aiError: null,

  // ── Panel / context-injection UI ──────────────────────────────────────────
  isOpen: false,
  inputDraft: '',

  // Persisted config setter — accepts any subset of the three fields.
  setAiConfig: ({ aiBaseUrl, aiApiKey, aiModel } = {}) => {
    const patch = {};
    if (aiBaseUrl !== undefined) { patch.aiBaseUrl = aiBaseUrl; writeLS(LS_BASE_URL, aiBaseUrl); }
    if (aiApiKey !== undefined) { patch.aiApiKey = aiApiKey; writeLS(LS_API_KEY, aiApiKey); }
    if (aiModel !== undefined) { patch.aiModel = aiModel; writeLS(LS_MODEL, aiModel); }
    set(patch);
  },

  openPanel: () => set({ isOpen: true }),
  closePanel: () => set({ isOpen: false }),
  togglePanel: () => set((s) => ({ isOpen: !s.isOpen })),
  setInputDraft: (text) => set({ inputDraft: text }),

  // ⚡ TARGET 4: context-injection shortcut — drop a code/text block straight into
  // the composer and reveal the drawer so the user can analyze it instantly.
  forwardToAi: (text) => set({ inputDraft: String(text ?? ''), isOpen: true }),

  // Internal: append a streamed token to the trailing assistant bubble.
  _appendToLastAssistant: (delta) =>
    set((state) => {
      const msgs = state.aiMessages.slice();
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          msgs[i] = { ...msgs[i], content: msgs[i].content + delta };
          return { aiMessages: msgs };
        }
      }
      return {};
    }),

  // ⚡ Construct an OpenAI-compatible /chat/completions payload with stream:true,
  // then parse the chunked SSE body token-by-token into the live transcript.
  sendAiMessage: async (promptText) => {
    const text = String(promptText ?? '').trim();
    if (!text || get().isStreaming) return;

    const { aiBaseUrl, aiApiKey, aiModel, aiMessages } = get();
    if (!aiApiKey) {
      set({ aiError: 'Add an API key in Settings → AI Sidecar to start chatting.' });
      return;
    }

    const userMsg = { role: 'user', content: text };
    // History actually sent upstream (before we append the empty assistant slot).
    const outgoing = [...aiMessages, userMsg];

    set({
      aiMessages: [...aiMessages, userMsg, { role: 'assistant', content: '' }],
      isStreaming: true,
      aiError: null,
      inputDraft: '',
    });

    const controller = new AbortController();
    activeController = controller;

    try {
      // Inside sendAiMessage:
      const endpoint = `${aiBaseUrl.replace(/\/+$/, '')}/chat/completions`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ model: aiModel, messages: outgoing, stream: true }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${detail ? ` — ${detail.slice(0, 180)}` : ''}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streaming = true;

      while (streaming) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        // SSE frames are newline-delimited; keep the trailing partial in `buffer`.
        const parts = buffer.split('\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') { streaming = false; break; }
          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content || '';
            if (delta) get()._appendToLastAssistant(delta);
          } catch {
            /* keep-alive ping or split frame — ignore and keep reading */
          }
        }
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        const message = `AI request failed: ${err?.message || err}`;
        set({ aiError: message });
        // Surface the failure inline if the assistant bubble never filled.
        set((state) => {
          const msgs = state.aiMessages.slice();
          const last = msgs[msgs.length - 1];
          if (last?.role === 'assistant' && !last.content) {
            msgs[msgs.length - 1] = { ...last, content: `⚠️ ${message}` };
            return { aiMessages: msgs };
          }
          return {};
        });
      }
    } finally {
      if (activeController === controller) activeController = null;
      set({ isStreaming: false });
    }
  },

  // Abort the in-flight stream but keep whatever has streamed so far.
  stopStreaming: () => {
    if (activeController) {
      activeController.abort();
      activeController = null;
    }
    set({ isStreaming: false });
  },

  // ⚡ Reset the local AI conversation context (config is preserved).
  clearAiHistory: () => {
    if (activeController) {
      activeController.abort();
      activeController = null;
    }
    set({ aiMessages: [], aiError: null, isStreaming: false });
  },
}));