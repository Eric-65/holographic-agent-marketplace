import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { SPRING } from "../../lib/motion/tokens";
import { useReducedMotion } from "../../lib/motion/useReducedMotion";

interface MotionScoreRingProps {
  /** 0–100. Must be a real metric (verification coverage, budget utilization, policy pass rate) — never a fabricated "trust score". */
  value: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  tone?: "good" | "warn" | "bad" | "cyan";
  /** Marks the ring as illustrative/demo data — renders a small "DEMO" tag so it's never mistaken for a live metric. */
  demo?: boolean;
}

const TONE_VAR: Record<NonNullable<MotionScoreRingProps["tone"]>, string> = {
  good: "var(--good)",
  warn: "var(--warn)",
  bad: "var(--bad)",
  cyan: "var(--accent-3)",
};

/**
 * Animated progress ring driven by useMotionValue + useSpring so the stroke
 * eases smoothly from its previous value to the new one instead of jumping —
 * used for verification coverage, budget utilization, and similar 0–100
 * metrics that are computed from real persisted data.
 */
export default function MotionScoreRing({ value, size = 88, strokeWidth = 7, label, sublabel, tone = "cyan", demo = false }: MotionScoreRingProps) {
  const reduced = useReducedMotion();
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const progress = useMotionValue(clamped);
  const spring = useSpring(progress, SPRING.value);
  // Reduced motion: read straight off the un-sprung source value, so there is
  // no interpolation to skip in the first place (no .jump() dependency needed).
  const activeValue = reduced ? progress : spring;
  const dashoffset = useTransform(activeValue, (v) => circumference - (v / 100) * circumference);
  const [displayValue, setDisplayValue] = useState(Math.round(clamped));

  useEffect(() => {
    progress.set(clamped);
  }, [clamped, progress]);

  useEffect(() => {
    return activeValue.on("change", (v) => setDisplayValue(Math.round(v)));
  }, [activeValue]);

  const color = TONE_VAR[tone];

  return (
    <div className="inline-flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--track)" strokeWidth={strokeWidth} />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            style={{ strokeDashoffset: dashoffset }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <motion.span className="mono text-[15px] font-semibold" style={{ color }}>
            {displayValue}%
          </motion.span>
        </div>
      </div>
      {(label || demo) && (
        <div className="text-center">
          {label && <div className="text-[10.5px] faint uppercase tracking-wider">{label}</div>}
          {sublabel && <div className="text-[10px] faint">{sublabel}</div>}
          {demo && <div className="mono text-[9px] mt-0.5" style={{ color: "var(--warn)" }}>DEMO DATA</div>}
        </div>
      )}
    </div>
  );
}
