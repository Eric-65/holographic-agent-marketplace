import { motion } from "framer-motion";
import { useReducedMotion } from "../../lib/motion/useReducedMotion";
import type { PipelineStatus } from "./MotionStatus";

interface MotionOrbProps {
  status: PipelineStatus;
  size?: number;
  accent?: string;
}

const TONE: Record<PipelineStatus, string> = {
  IDLE: "var(--accent-3)",
  THINKING: "var(--accent-3)",
  PROPOSING: "var(--accent-3)",
  CHECKING: "var(--accent)",
  APPROVED: "var(--good)",
  AWAITING_APPROVAL: "var(--warn)",
  EXECUTING: "var(--accent-3)",
  COMPLETED: "var(--good)",
  BLOCKED: "var(--bad)",
  FAILED: "var(--bad)",
  PAUSED: "var(--text-faint)",
};

/**
 * The Holographic agent orb — no prior version existed in this codebase to
 * "enhance" (verified: no orb component anywhere in src), so this is a new
 * component built to the spec. Continuous ambient motion (the slow drifting
 * gradient) is pure CSS via the `holo-orb-ambient` keyframe in index.css —
 * cheap, GPU-composited, and automatically paused by the
 * prefers-reduced-motion media query at the CSS layer. Framer Motion only
 * ever drives the *state* transition (idle → thinking → checking →
 * executing → success/blocked), never the constant idle drift.
 */
export default function MotionOrb({ status, size = 56, accent }: MotionOrbProps) {
  const reduced = useReducedMotion();
  const color = accent ?? TONE[status];
  const isBusy = status === "THINKING" || status === "PROPOSING" || status === "CHECKING" || status === "EXECUTING" || status === "AWAITING_APPROVAL";
  const isTerminalGood = status === "APPROVED" || status === "COMPLETED";
  const isTerminalBad = status === "BLOCKED" || status === "FAILED";

  return (
    <motion.div
      className="relative rounded-full holo-orb-ambient"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 32% 28%, color-mix(in oklab, ${color} 55%, white 8%), color-mix(in oklab, ${color} 30%, transparent) 55%, transparent 75%)`,
        border: `1px solid color-mix(in oklab, ${color} 40%, transparent)`,
      }}
      animate={
        reduced
          ? { scale: 1, opacity: 1 }
          : isTerminalGood || isTerminalBad
            ? { scale: [1, 1.18, 1] }
            : isBusy
              ? { scale: [1, 1.05, 1], opacity: [0.85, 1, 0.85] }
              : { scale: 1, opacity: 1 }
      }
      transition={
        reduced
          ? { duration: 0.15 }
          : isTerminalGood || isTerminalBad
            ? { duration: 0.5, ease: "easeOut" }
            : isBusy
              ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.2 }
      }
    >
      {status === "CHECKING" && !reduced && (
        <motion.span
          aria-hidden
          className="absolute -inset-1 rounded-full"
          style={{ border: `1.5px solid ${color}`, borderTopColor: "transparent", borderLeftColor: "transparent" }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
        />
      )}
    </motion.div>
  );
}
