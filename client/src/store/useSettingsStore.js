import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ⚡ ZERO-COST UI ENGINE
// Pure client-side personalization. Everything here lives in localStorage via
// the `persist` middleware — no backend route, no DB column, no API call. The
// preferences survive reloads and PWA cold-boots at zero infrastructure cost.

// slate-900 — the app's default chat canvas.
export const DEFAULT_CHAT_BACKGROUND = '#0f172a';

// Resolve the stored preference into an inline-style object that can be spread
// onto any element. Kept as a pure helper so components stay dumb and there's a
// single source of truth for how a background renders.
export const resolveBackgroundStyle = (chatBackground, backgroundType) => {
  if (backgroundType === 'gradient') {
    // Blend the chosen color down into near-black (slate-950) for depth.
    return { backgroundImage: `linear-gradient(160deg, ${chatBackground} 0%, #020617 100%)` };
  }
  return { backgroundColor: chatBackground };
};

export const useSettingsStore = create(
  persist(
    (set) => ({
      // Solid color (any CSS color string) used as the chat canvas.
      chatBackground: DEFAULT_CHAT_BACKGROUND,
      // 'solid' | 'gradient'
      backgroundType: 'solid',

      // Patch one or both preferences. Accepts a partial object so callers can
      // update just the color, just the type, or both atomically.
      updateBackground: ({ chatBackground, backgroundType } = {}) =>
        set((state) => ({
          chatBackground: chatBackground ?? state.chatBackground,
          backgroundType: backgroundType ?? state.backgroundType,
        })),

      // Restore factory defaults.
      resetBackground: () =>
        set({ chatBackground: DEFAULT_CHAT_BACKGROUND, backgroundType: 'solid' }),
    }),
    {
      name: 'zync-ui-settings', // localStorage key
    }
  )
);
