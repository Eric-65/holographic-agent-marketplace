import type { Variants } from "framer-motion";
import { DURATION, EASE, SPRING } from "./tokens";

/**
 * Shared variant library. Every reveal/hover/modal/toast animation in the
 * app should reuse one of these rather than inventing a one-off transform,
 * so the whole product moves with one consistent vocabulary.
 *
 * Each variant has a `Reduced` counterpart — same states, movement removed,
 * used when useReducedMotion() is true.
 */

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.normal, ease: EASE.out } },
};

export const fadeUpReduced: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.fast } },
};

export const pageReveal: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.normal, ease: EASE.out, staggerChildren: 0.04 },
  },
};

export const scaleReveal: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: DURATION.normal, ease: EASE.out } },
};

export const scaleRevealReduced: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.fast } },
};

/** Container for staggered children — pair with fadeUp/scaleReveal on children. */
export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.02 } },
};

export const modalBackdrop: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.normal } },
  exit: { opacity: 0, transition: { duration: DURATION.fast } },
};

export const modalPanel: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", ...SPRING.gentle } },
  exit: { opacity: 0, y: 8, scale: 0.99, transition: { duration: DURATION.fast, ease: EASE.in } },
};

export const modalPanelReduced: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.fast } },
  exit: { opacity: 0, transition: { duration: DURATION.fast } },
};

export const cardHover = {
  rest: { y: 0, scale: 1 },
  hover: { y: -4, scale: 1.01, transition: { duration: DURATION.fast, ease: EASE.standard } },
};

export const toastVariants: Variants = {
  hidden: { opacity: 0, y: -8, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: DURATION.normal, ease: EASE.out } },
  exit: { opacity: 0, x: 24, transition: { duration: DURATION.fast, ease: EASE.in } },
};

export const drawer: Variants = {
  hidden: { opacity: 0, y: -6 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.fast, ease: EASE.out } },
  exit: { opacity: 0, y: -4, transition: { duration: DURATION.fast, ease: EASE.in } },
};

export const tabContent: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.fast, ease: EASE.out } },
  exit: { opacity: 0, y: -4, transition: { duration: DURATION.fast, ease: EASE.in } },
};

/** Sequential rule-trace row reveal — used by the policy decision animation. */
export const traceRow: Variants = {
  hidden: { opacity: 0, x: -6 },
  visible: { opacity: 1, x: 0, transition: { duration: DURATION.fast, ease: EASE.out } },
};

export const traceContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};
