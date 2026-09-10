import { motion } from "framer-motion";
import { useReducedMotion } from "../../lib/motion/useReducedMotion";

export type PipelineStatus =
  | "IDLE"
  | "THINKING"
  | "PROPOSING"
  | "CHECKING"
  | "APPROVED"
  | "AWAITING_APPROVAL"
  | "EXECUTING"
  | "COMPLETED"
  | "BLOCKED"
  | "FAILED"
  | "PAUSED";

interface StatusConfig {
  label: string;
  tone: string;
  /** true = loops while the state holds (thinking/checking/executing/awaiting); false = plays once then rests (approved/completed/blocked/failed). */
  loop: boolean;
  /** "pulse" | "scan" | "static" — the visual treatment. */
  kind: "pulse" | "scan" | "static";
}

const CONFIG: Record<PipelineStatus, StatusConfig> = {
  IDLE: { label: "Idle", tone: "var(--text-faint)", loop: false, kind: "static" },
  THINKING: { label: "Thinking", tone: "var(--accent-3)", loop: true, kind: "pulse" },
  PROPOSING: { label: "Proposing", tone: "var(--accent-3)", loop: false, kind: "pulse" },
  CHECKING: { label: "Checking policy", tone: "var(--accent)", loop: true, kind: "scan" },
  APPROVED: { label: "Approved", tone: "var(--good)", loop: false, kind: "pulse" },
  AWAITING_APPROVAL: { label: "Awaiting approval", tone: "var(--warn)", loop: true, kind: "pulse" },
  EXECUTING: { label: "Executing", tone: "var(--accent-3)", loop: true, kind: "pulse" },
  COMPLETED: { label: "Completed", tone: "var(--good)", loop: false, kind: "pulse" },
  BLOCKED: { label: "Blocked", tone: "var(--bad)", loop: false, kind: "pulse" },
  FAILED: { label: "Failed", tone: "var(--bad)", loop: false, kind: "pulse" },
  PAUSED: { label: "Paused", tone: "var(--text-faint)", loop: false, kind: "static" },
};

interface MotionStatusProps {
  status: PipelineStatus;
  /** Overrides the default label — e.g. a more specific message for BLOCKED. */
  label?: string;
  size?: "sm" | "md";
  /** Hide the text label — only use where the surrounding UI already states the status in text (accessibility: status must never be conveyed by color/motion alone). */
  hideLabel?: boolean;
  className?: string;
}

/**
 * The shared status indicator for anything moving through the
 * propose → policy → approval → execution pipeline. Continuous states
 * (THINKING/CHECKING/AWAITING_APPROVAL/EXECUTING) animate for as long as
 * they hold; terminal states (APPROVED/COMPLETED/BLOCKED/FAILED) play one
 * short transition and then sit still — nothing loops indefinitely once a
 * decision is final. The status text is always rendered alongside the
 * animation, never conveyed by color/motion alone.
 */
export default function MotionStatus({ status, label, size = "md", hideLabel = false, className = "" }: MotionStatusProps) {
  const reduced = useReducedMotion();
  const cfg = CONFIG[status];
  const dotSize = size === "sm" ? 6 : 8;
  const displayLabel = label ?? cfg.label;

  return (
    <span className={`inline-flex items-center gap-2 ${className}`} role="status" aria-label={displayLabel}>
      <span className="relative inline-flex items-center justify-center shrink-0" style={{ width: dotSize + 6, height: dotSize + 6 }}>
        {cfg.kind === "scan" && !reduced && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{ border: `1.5px solid ${cfg.tone}`, borderTopColor: "transparent", borderRightColor: "transparent" }}
            animate={{ rotate: 360 }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
          />
        )}
        <motion.span
          aria-hidden
          className="rounded-full"
          style={{ width: dotSize, height: dotSize, background: cfg.tone, boxShadow: `0 0 6px ${cfg.tone}` }}
          initial={cfg.kind === "static" ? undefined : { opacity: 0.6, scale: 0.85 }}
          animate={
            reduced || cfg.kind === "static"
              ? { opacity: 1, scale: 1 }
              : cfg.loop
                ? { opacity: [0.55, 1, 0.55], scale: [0.9, 1.05, 0.9] }
                : { opacity: 1, scale: [0.85, 1.25, 1] }
          }
          transition={
            reduced || cfg.kind === "static"
              ? { duration: 0.15 }
              : cfg.loop
                ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
                : { duration: 0.5, ease: "easeOut" }
          }
        />
      </span>
      {!hideLabel && (
        <span className="mono text-[10.5px] uppercase tracking-wider" style={{ color: cfg.tone }}>
          {displayLabel}
        </span>
      )}
    </span>
  );
}
