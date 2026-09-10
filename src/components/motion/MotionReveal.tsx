import { motion, type HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";
import { fadeUp, fadeUpReduced, scaleReveal, scaleRevealReduced, staggerContainer } from "../../lib/motion/variants";
import { VIEWPORT_ONCE } from "../../lib/motion/tokens";
import { useReducedMotion } from "../../lib/motion/useReducedMotion";

type RevealKind = "fadeUp" | "scale";

interface MotionRevealProps extends Omit<HTMLMotionProps<"div">, "variants" | "initial" | "animate" | "whileInView"> {
  children: ReactNode;
  /** "mount" reveals once on mount (page sections); "inView" reveals when scrolled into view (long lists, marketplace grids). */
  mode?: "mount" | "inView";
  kind?: RevealKind;
  /** Index within a staggered group — multiplies the container's staggerChildren delay. */
  delay?: number;
}

/**
 * The single reveal primitive used across the app: page sections, cards,
 * panels. Picks fade+travel or fade-only automatically based on the user's
 * reduced-motion preference — callers never need to branch on it themselves.
 */
export default function MotionReveal({ children, mode = "mount", kind = "fadeUp", delay = 0, ...rest }: MotionRevealProps) {
  const reduced = useReducedMotion();
  const variants = reduced ? (kind === "scale" ? scaleRevealReduced : fadeUpReduced) : kind === "scale" ? scaleReveal : fadeUp;

  const viewportProps = mode === "inView" ? { whileInView: "visible", viewport: VIEWPORT_ONCE, initial: "hidden" } : { initial: "hidden", animate: "visible" };

  return (
    <motion.div variants={variants} transition={delay ? { delay: delay * 0.05 } : undefined} {...viewportProps} {...rest}>
      {children}
    </motion.div>
  );
}

/** Wraps a group of MotionReveal children with staggered entrance timing. */
export function MotionRevealGroup({ children, mode = "mount", ...rest }: { children: ReactNode; mode?: "mount" | "inView" } & Omit<HTMLMotionProps<"div">, "variants" | "initial" | "animate" | "whileInView">) {
  const viewportProps = mode === "inView" ? { whileInView: "visible", viewport: VIEWPORT_ONCE, initial: "hidden" } : { initial: "hidden", animate: "visible" };
  return (
    <motion.div variants={staggerContainer} {...viewportProps} {...rest}>
      {children}
    </motion.div>
  );
}
