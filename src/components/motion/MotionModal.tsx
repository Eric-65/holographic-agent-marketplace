import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { modalBackdrop, modalPanel, modalPanelReduced } from "../../lib/motion/variants";
import { useReducedMotion } from "../../lib/motion/useReducedMotion";

interface MotionModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  panelClassName?: string;
  /** z-index for the overlay — dialogs stack (e.g. deployment wizard opened from an agent page). */
  zIndex?: number;
}

/**
 * Shared modal chrome: animated backdrop (opacity only) + animated panel
 * (opacity + y + scale, no dramatic scale per spec — 0.98 → 1). Handles
 * mount/unmount via AnimatePresence so closing never leaves an invisible-
 * but-still-interactive dialog in the DOM.
 *
 * Callers own the panel's own content/header/footer — this only wraps the
 * outer backdrop + panel shell.
 */
export default function MotionModal({ open, onClose, children, panelClassName = "", zIndex = 100 }: MotionModalProps) {
  const reduced = useReducedMotion();
  const panelVariants = reduced ? modalPanelReduced : modalPanel;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 grid place-items-center p-4 overlay"
          style={{ zIndex }}
          variants={modalBackdrop}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={onClose}
        >
          <motion.div className={panelClassName} variants={panelVariants} initial="hidden" animate="visible" exit="exit" onClick={(e) => e.stopPropagation()}>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
