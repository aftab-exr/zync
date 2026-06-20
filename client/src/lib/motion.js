// ──────────────────────────────────────────────────────────────────────────
// NEUBRUTALISM MOTION ENGINE
// Single source of truth for every transition, matching neubrutalism-DESIGN.md.
//
// Guidelines:
//   - Physics: Ease-out curves, 200-300ms duration.
//   - Entry animations: Fade + translate-Y (16px → 0) over 420ms ease-out.
//   - Page transitions: Fade only (200ms).
// ──────────────────────────────────────────────────────────────────────────

import { DEFAULT_MOTION_PROFILE, useSettingsStore } from '../store/useSettingsStore';

// Transition configs matching the exact Neubrutalism specs
const entryTransition = { type: 'tween', ease: 'easeOut', duration: 0.42 }; // 420ms ease-out
const hoverTransition = { type: 'tween', ease: 'easeOut', duration: 0.20 }; // 200ms
const fadeTransition = { type: 'tween', ease: 'easeOut', duration: 0.20 }; // 200ms

const PROFILE_TRANSITIONS = {
  fluid: entryTransition,
  snappy: { type: 'tween', ease: 'linear', duration: 0.15 },
  reduced: { type: 'tween', duration: 0.1 },
};

const isReduced = (profile) => profile === 'reduced';

export const getMotionProfile = (currentProfile) =>
  PROFILE_TRANSITIONS[currentProfile] || PROFILE_TRANSITIONS[DEFAULT_MOTION_PROFILE];

export const getBackdropVariants = (profile) => {
  return {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: fadeTransition },
    exit: { opacity: 0, transition: fadeTransition },
  };
};

export const getModalVariants = (profile) => {
  if (isReduced(profile)) {
    return {
      hidden: { opacity: 0 },
      visible: { opacity: 1, transition: fadeTransition },
      exit: { opacity: 0, transition: fadeTransition },
    };
  }
  return {
    hidden: { opacity: 0, scale: 0.95, y: 16 },
    visible: { opacity: 1, scale: 1, y: 0, transition: entryTransition },
    exit: { opacity: 0, scale: 0.95, y: 16, transition: fadeTransition },
  };
};

export const getDrawerVariants = (profile) => {
  if (isReduced(profile)) {
    return {
      hidden: { opacity: 0 },
      visible: { opacity: 1, transition: fadeTransition },
      exit: { opacity: 0, transition: fadeTransition },
    };
  }
  return {
    hidden: { x: '100%' },
    visible: { x: 0, transition: entryTransition },
    exit: { x: '100%', transition: fadeTransition },
  };
};

export const getMessageBubbleVariants = (profile) => {
  if (isReduced(profile)) {
    return {
      hidden: { opacity: 0 },
      visible: { opacity: 1, transition: fadeTransition },
      exit: { opacity: 0, transition: fadeTransition },
    };
  }
  return {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: entryTransition },
    exit: { opacity: 0, y: 8, transition: fadeTransition },
  };
};

export const getDropdownVariants = (profile) => {
  if (isReduced(profile)) {
    return {
      hidden: { opacity: 0 },
      visible: { opacity: 1, transition: fadeTransition },
      exit: { opacity: 0, transition: fadeTransition },
    };
  }
  return {
    hidden: { opacity: 0, scaleY: 0.85, y: -6 },
    visible: { opacity: 1, scaleY: 1, y: 0, transition: entryTransition },
    exit: { opacity: 0, scaleY: 0.85, y: -6, transition: fadeTransition },
  };
};

export const getMotion = (currentProfile) => {
  const profile = PROFILE_TRANSITIONS[currentProfile] ? currentProfile : DEFAULT_MOTION_PROFILE;
  return {
    profile,
    reduced: isReduced(profile),
    transition: getMotionProfile(profile),
    backdropVariants: getBackdropVariants(profile),
    modalVariants: getModalVariants(profile),
    drawerVariants: getDrawerVariants(profile),
    messageBubbleVariants: getMessageBubbleVariants(profile),
    dropdownVariants: getDropdownVariants(profile),
  };
};

export const useMotion = () => {
  const profile = useSettingsStore((s) => s.motionProfile);
  return getMotion(profile || 'fluid');
};

export default getMotion;
