import type { Transition } from "framer-motion";
import { DURATION, EASE, SPRING } from "./tokens";

/**
 * Standalone `transition={...}` presets, for motion elements that need a
 * transition without a full variant (e.g. a single whileHover/whileTap, or
 * a value driven by useSpring). Variants in variants.ts already embed their
 * own transitions — reach for these only when you're not using a variant.
 */

export const TRANSITIONS = {
  fast: { duration: DURATION.fast, ease: EASE.standard } satisfies Transition,
  normal: { duration: DURATION.normal, ease: EASE.standard } satisfies Transition,
  slow: { duration: DURATION.slow, ease: EASE.standard } satisfies Transition,
  enter: { duration: DURATION.normal, ease: EASE.out } satisfies Transition,
  exit: { duration: DURATION.fast, ease: EASE.in } satisfies Transition,
  springValue: { type: "spring", ...SPRING.value } satisfies Transition,
  springParallax: { type: "spring", ...SPRING.parallax } satisfies Transition,
  springGentle: { type: "spring", ...SPRING.gentle } satisfies Transition,
  tap: { duration: 0.1, ease: EASE.standard } satisfies Transition,
} as const;
