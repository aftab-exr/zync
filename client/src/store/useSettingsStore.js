import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ⚡ ZERO-COST UI ENGINE
// Pure client-side personalization. Everything here lives in localStorage via
// the `persist` middleware — no backend route, no DB column, no API call. The
// preferences survive reloads and PWA cold-boots at zero infrastructure cost.

// slate-900 — the app's default chat canvas.
export const DEFAULT_CHAT_BACKGROUND = '#0f172a';

// Motion profiles drive every animation in the app via lib/motion.js.
//  - fluid   : Apple-style spring physics (the HIG default).
//  - snappy  : fast linear transitions for low-latency feel.
//  - reduced : accessibility standard — opacity fades only, no transforms.
export const MOTION_PROFILES = ['fluid', 'snappy', 'reduced'];
export const DEFAULT_MOTION_PROFILE = 'fluid';

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

      // 'fluid' | 'snappy' | 'reduced' — the active animation physics profile.
      motionProfile: DEFAULT_MOTION_PROFILE,

      // Patch one or both preferences. Accepts a partial object so callers can
      // update just the color, just the type, or both atomically.
      updateBackground: ({ chatBackground, backgroundType } = {}) =>
        set((state) => ({
          chatBackground: chatBackground ?? state.chatBackground,
          backgroundType: backgroundType ?? state.backgroundType,
        })),

      // Switch the global motion profile. Ignores unknown values so a stale
      // localStorage entry can never wedge the app into an invalid state.
      setMotionProfile: (profile) =>
        set((state) => ({
          motionProfile: MOTION_PROFILES.includes(profile) ? profile : state.motionProfile,
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
