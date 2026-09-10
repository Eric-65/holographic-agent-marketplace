import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { PARALLAX_RANGE_PX, SPRING } from "../../lib/motion/tokens";
import { useReducedMotion } from "../../lib/motion/useReducedMotion";

interface MotionParallaxProps {
  children: React.ReactNode;
  className?: string;
  /** Max travel in px. Kept small on purpose — content must stay readable. */
  range?: number;
  /** Inverts direction — useful for background layers that should drift opposite to foreground. */
  invert?: boolean;
}

function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

/**
 * Pointer-tracked parallax wrapper for hero-style decoration (ambient orb,
 * background glow, featured panel). Pointer position is tracked via
 * useMotionValue (never React state, to avoid a re-render per mousemove)
 * and smoothed with useSpring. Disabled entirely on touch devices and when
 * reduced motion is preferred — the wrapped content still renders normally,
 * just without movement.
 */
export default function MotionParallax({ children, className = "", range = PARALLAX_RANGE_PX, invert = false }: MotionParallaxProps) {
  const reduced = useReducedMotion();
  const [touch, setTouch] = useState(true); // default to "off" until we've confirmed pointer capability, avoids a flash of movement on touch
  const ref = useRef<HTMLDivElement>(null);

  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const springX = useSpring(pointerX, SPRING.parallax);
  const springY = useSpring(pointerY, SPRING.parallax);

  const sign = invert ? -1 : 1;
  const x = useTransform(springX, (v) => v * range * sign);
  const y = useTransform(springY, (v) => v * range * sign);

  useEffect(() => {
    setTouch(isTouchDevice());
  }, []);

  const disabled = reduced || touch;

  useEffect(() => {
    if (disabled) return;
    const el = ref.current;
    if (!el) return;
    const handleMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width - 0.5; // -0.5..0.5
      const relY = (e.clientY - rect.top) / rect.height - 0.5;
      pointerX.set(relX);
      pointerY.set(relY);
    };
    const handleLeave = () => {
      pointerX.set(0);
      pointerY.set(0);
    };
    el.addEventListener("pointermove", handleMove);
    el.addEventListener("pointerleave", handleLeave);
    return () => {
      el.removeEventListener("pointermove", handleMove);
      el.removeEventListener("pointerleave", handleLeave);
    };
  }, [disabled, pointerX, pointerY]);

  if (disabled) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  return (
    <motion.div ref={ref} className={className} style={{ x, y }}>
      {children}
    </motion.div>
  );
}
