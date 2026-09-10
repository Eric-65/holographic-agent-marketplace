interface MotionSkeletonProps {
  className?: string;
  height?: number | string;
  width?: number | string;
  rounded?: "md" | "lg" | "full";
}

/**
 * Shimmer loading placeholder — plain CSS animation (see .skeleton-shimmer
 * in index.css), not Framer Motion, since it's a purely ambient/continuous
 * effect with no state to transition between. Automatically respects
 * prefers-reduced-motion via the same CSS media query every other ambient
 * effect uses.
 */
export default function MotionSkeleton({ className = "", height = 16, width = "100%", rounded = "md" }: MotionSkeletonProps) {
  const radius = rounded === "full" ? "9999px" : rounded === "lg" ? "12px" : "8px";
  return <div className={`skeleton-shimmer ${className}`} style={{ height, width, borderRadius: radius }} aria-hidden />;
}
