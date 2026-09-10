import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { SPRING } from "../../lib/motion/tokens";
import { useReducedMotion } from "../../lib/motion/useReducedMotion";

interface MotionCountUpProps {
  /** The real value to display — must be a safe integer or already-rounded decimal. Never derive this from floating-point money math. */
  value: number;
  /** Formats the animated (in-between) value for display. Default: rounds to an integer. */
  format?: (n: number) => string;
  className?: string;
  prefix?: string;
  suffix?: string;
}

/**
 * Animated number — settles on the real value via a spring, never a timer.
 * Because it's driven by useMotionValue/useSpring, it correctly re-animates
 * from wherever it currently is if `value` changes again mid-animation
 * (e.g. two executions complete in quick succession), and does nothing at
 * all if the value hasn't changed.
 *
 * This is presentation only: it never rounds/truncates the *stored* value,
 * only what's shown while the spring is in flight — the final rendered
 * number is always the exact `value` passed in.
 */
export default function MotionCountUp({ value, format = (n) => Math.round(n).toLocaleString(), className, prefix = "", suffix = "" }: MotionCountUpProps) {
  const reduced = useReducedMotion();
  const motionValue = useMotionValue(value);
  const spring = useSpring(motionValue, SPRING.value);
  const [display, setDisplay] = useState(() => format(value));
  const mounted = useRef(false);

  useEffect(() => {
    if (reduced) {
      setDisplay(format(value));
      motionValue.set(value);
      return;
    }
    // First mount: count up from 0 for a brief "system coming alive" moment; later updates animate from the current value.
    if (!mounted.current) {
      mounted.current = true;
      motionValue.set(0);
    }
    motionValue.set(value);
  }, [value, reduced, format, motionValue]);

  useEffect(() => {
    if (reduced) return;
    const unsub = spring.on("change", (v) => setDisplay(format(v)));
    return unsub;
  }, [spring, format, reduced]);

  return (
    <motion.span className={className}>
      {prefix}
      {display}
      {suffix}
    </motion.span>
  );
}
