import { motion, type HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";
import { cardHover } from "../../lib/motion/variants";
import { useReducedMotion } from "../../lib/motion/useReducedMotion";

interface MotionCardProps extends Omit<HTMLMotionProps<"div">, "variants" | "initial" | "whileHover" | "animate"> {
  children: ReactNode;
  /** Adds a slow, low-opacity gradient sheen that sweeps across on hover. Off by default — opt in per card. */
  reflection?: boolean;
}

/**
 * Hover elevation for agent/marketplace cards — small lift, no rotation, no
 * layout shift (transform-only). Reduced motion keeps only a border/opacity
 * cue instead of the vertical travel.
 */
export default function MotionCard({ children, reflection = false, className = "", ...rest }: MotionCardProps) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className={`relative overflow-hidden ${className}`}
      initial="rest"
      whileHover="hover"
      animate="rest"
      variants={reduced ? { rest: {}, hover: {} } : cardHover}
      {...rest}
    >
      {children}
      {reflection && !reduced && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          initial={{ opacity: 0, backgroundPosition: "-40% 0%" }}
          variants={{
            hover: {
              opacity: 1,
              backgroundPosition: "140% 0%",
              transition: { duration: 0.9, ease: "easeOut" },
            },
            rest: { opacity: 0 },
          }}
          style={{
            backgroundImage: "linear-gradient(75deg, transparent 40%, color-mix(in oklab, var(--accent-3) 14%, transparent) 50%, transparent 60%)",
            backgroundSize: "220% 100%",
          }}
        />
      )}
    </motion.div>
  );
}
