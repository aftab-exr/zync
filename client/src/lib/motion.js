// ──────────────────────────────────────────────────────────────────────────
// THE CUPERTINO MOTION ENGINE
// Single source of truth for every framer-motion transition in the app. The
// active physics profile is driven by `motionProfile` in useSettingsStore, so
// the whole UI re-times itself the instant the user changes their preference.
//
// Three profiles, mapped to real kinematics rather than arbitrary durations:
//   • fluid   — Apple HIG spring. Subtle overshoot; the system default.
//   • snappy  — fast linear tween for a low-latency, "instant" feel.
//   • reduced — accessibility standard. Opacity only — never x / y / scale.
// ──────────────────────────────────────────────────────────────────────────

import { DEFAULT_MOTION_PROFILE, useSettingsStore } from '../store/useSettingsStore';

// Raw transition configs. These are the ONLY place spring/tween constants live.
const PROFILE_TRANSITIONS = {
  fluid: { type: 'spring', stiffness: 300, damping: 24, mass: 0.8 },
  snappy: { type: 'tween', ease: 'circOut', duration: 0.15 },
  reduced: { type: 'tween', duration: 0.1 },
};

// Reduced motion forbids positional/scale transforms — only the alpha channel
// is authorized. Helper keeps that rule in exactly one spot.
const isReduced = (profile) => profile === 'reduced';

// Resolve a profile string into its framer-motion `transition` object. Falls
// back to the default profile so a stale localStorage value can never break an
// animation. This is the low-level primitive the variants are built on.
export const getMotionProfile = (currentProfile) =>
  PROFILE_TRANSITIONS[currentProfile] || PROFILE_TRANSITIONS[DEFAULT_MOTION_PROFILE];

// ──────────────────────────────────────────────────────────────────────────
// Variant factories
// Each takes the active profile and returns a hidden/visible/exit variant set
// with the resolved transition baked in. Under `reduced`, every transform is
// dropped and only opacity animates.
// ──────────────────────────────────────────────────────────────────────────

// Plain backdrop / scrim — always opacity-only, regardless of profile.
export const getBackdropVariants = (profile) => {
  const transition = getMotionProfile(profile);
  return {
    hidden: { opacity: 0, transition },
    visible: { opacity: 1, transition },
    exit: { opacity: 0, transition },
  };
};

// Modals & sheets — scaled fade-in from 0.95 → 1.0.
export const getModalVariants = (profile) => {
  const transition = getMotionProfile(profile);
  if (isReduced(profile)) {
    return {
      hidden: { opacity: 0, transition },
      visible: { opacity: 1, transition },
      exit: { opacity: 0, transition },
    };
  }
  return {
    hidden: { opacity: 0, scale: 0.95, y: 8 },
    visible: { opacity: 1, scale: 1, y: 0, transition },
    exit: { opacity: 0, scale: 0.95, y: 8, transition },
  };
};

// Right-edge drawer / sidecar — slides in from x: 100% → 0%.
export const getDrawerVariants = (profile) => {
  const transition = getMotionProfile(profile);
  if (isReduced(profile)) {
    return {
      hidden: { opacity: 0, transition },
      visible: { opacity: 1, transition },
      exit: { opacity: 0, transition },
    };
  }
  return {
    hidden: { x: '100%' },
    visible: { x: 0, transition },
    exit: { x: '100%', transition },
  };
};

// Chat / list bubbles — cascading slide-up + fade from y: 20 → 0.
export const getMessageBubbleVariants = (profile) => {
  const transition = getMotionProfile(profile);
  if (isReduced(profile)) {
    return {
      hidden: { opacity: 0, transition },
      visible: { opacity: 1, transition },
      exit: { opacity: 0, transition },
    };
  }
  return {
    hidden: { opacity: 0, y: 20, scale: 0.96 },
    visible: { opacity: 1, y: 0, scale: 1, transition },
    exit: { opacity: 0, y: 8, scale: 0.96, transition },
  };
};

// Dropdown menu — origin-top scaleY collapse from 0 → 1.
export const getDropdownVariants = (profile) => {
  const transition = getMotionProfile(profile);
  if (isReduced(profile)) {
    return {
      hidden: { opacity: 0, transition },
      visible: { opacity: 1, transition },
      exit: { opacity: 0, transition },
    };
  }
  return {
    hidden: { opacity: 0, scaleY: 0.85, y: -6 },
    visible: { opacity: 1, scaleY: 1, y: 0, transition },
    exit: { opacity: 0, scaleY: 0.85, y: -6, transition },
  };
};

// ──────────────────────────────────────────────────────────────────────────
// getMotion(profile) — the high-level entry point used across components.
// Returns the resolved transition plus a ready-to-spread bundle of every
// variant set, so a component only computes motion once:
//
//   const M = getMotion(useSettingsStore.getState().motionProfile);
//   <motion.div variants={M.modalVariants} transition={M.transition} … />
// ──────────────────────────────────────────────────────────────────────────
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

// Reactive convenience hook — subscribes to the live motionProfile so a
// component re-renders (and re-times) the instant the user switches profiles.
export const useMotion = () => getMotion(useSettingsStore((s) => s.motionProfile));

export default getMotion;
