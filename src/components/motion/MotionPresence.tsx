import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { toastVariants } from "../../lib/motion/variants";

export { AnimatePresence };

/**
 * One list item that animates in/out via AnimatePresence — used for the
 * notification feed, batch/schedule occurrence rows, and anywhere else a
 * list needs entries to animate on add/remove rather than jump-cut. The
 * caller wraps the mapped list in <AnimatePresence>; this is the per-item
 * shell so every list gets the same enter/exit motion.
 */
export function PresenceItem({ children, layoutId, className }: { children: ReactNode; layoutId?: string; className?: string }) {
  return (
    <motion.div layout layoutId={layoutId} variants={toastVariants} initial="hidden" animate="visible" exit="exit" className={className}>
      {children}
    </motion.div>
  );
}
