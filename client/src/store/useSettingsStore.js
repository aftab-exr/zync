import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ⚡ ZERO-COST UI ENGINE
// Neubrutalism Style - Default chat background is now the light UI base color.
export const DEFAULT_CHAT_BACKGROUND = '#F4F4F5';

export const MOTION_PROFILES = ['fluid', 'snappy', 'reduced'];
export const DEFAULT_MOTION_PROFILE = 'fluid';

// Neubrutalism demands flat solid colors. We only resolve solid background colors.
export const resolveBackgroundStyle = (chatBackground) => {
  return { backgroundColor: chatBackground };
};

export const useSettingsStore = create(
  persist(
    (set) => ({
      chatBackground: DEFAULT_CHAT_BACKGROUND,
      motionProfile: DEFAULT_MOTION_PROFILE,

      updateBackground: ({ chatBackground } = {}) =>
        set((state) => ({
          chatBackground: chatBackground ?? state.chatBackground,
        })),

      setMotionProfile: (profile) =>
        set((state) => ({
          motionProfile: MOTION_PROFILES.includes(profile) ? profile : state.motionProfile,
        })),

      resetBackground: () =>
        set({ chatBackground: DEFAULT_CHAT_BACKGROUND }),
    }),
    {
      name: 'zync-ui-settings',
    }
  )
);
