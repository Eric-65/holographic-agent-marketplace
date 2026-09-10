import { useReducedMotion as useFramerReducedMotion } from "framer-motion";

/**
 * Thin wrapper over framer-motion's own `useReducedMotion` (which already
 * tracks the `prefers-reduced-motion` media query reactively). Centralized
 * here so every motion primitive imports one thing, and so the "what do we
 * do when reduced motion is on" policy lives in one place:
 *
 *   - parallax: disabled entirely
 *   - reveals: fade only, no travel distance
 *   - continuous/ambient movement (orb drift, shimmer): disabled
 *   - status/state transitions: kept, but reduced to opacity-only
 *
 * Functionality never changes — only movement does.
 */
export function useReducedMotion(): boolean {
  return !!useFramerReducedMotion();
}
