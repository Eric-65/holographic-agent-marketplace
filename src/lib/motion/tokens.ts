/**
 * Central motion configuration — Holographic's animation language.
 *
 * Every duration/easing used anywhere in the app should come from here.
 * The product feel is "premium financial operating system," not a flashy
 * crypto landing page: short, purposeful transitions communicating state,
 * never decoration for its own sake.
 */

export const DURATION = {
  /** Button/hover feedback, tab switches, micro-interactions. */
  fast: 0.15,
  /** Reveals, modal enter, nav indicator. */
  normal: 0.25,
  /** Larger panel transitions, staggered lists. */
  slow: 0.35,
  /** Ambient/ceremonial only — score rings, count-up settle. */
  ambient: 0.5,
} as const;

export const EASE = {
  /** Default — snappy but not abrupt. */
  standard: [0.22, 1, 0.36, 1] as const,
  /** Entrances — content arriving. */
  out: [0.16, 1, 0.3, 1] as const,
  /** Exits — content leaving. */
  in: [0.4, 0, 1, 1] as const,
} as const;

/** Spring presets — used for anything driven by useSpring (count-ups, rings, parallax). */
export const SPRING = {
  /** Numbers, score rings — settles quickly, no overshoot wobble. */
  value: { stiffness: 90, damping: 20, mass: 0.6 },
  /** Parallax, pointer-follow — soft, no jitter. */
  parallax: { stiffness: 60, damping: 18, mass: 0.4 },
  /** Modal/card entrances that want a tiny bit of life. */
  gentle: { stiffness: 260, damping: 26 },
} as const;

/** Standard tween used by most reveal/hover transitions. */
export const TRANSITION = {
  fast: { duration: DURATION.fast, ease: EASE.standard },
  normal: { duration: DURATION.normal, ease: EASE.standard },
  slow: { duration: DURATION.slow, ease: EASE.standard },
  enter: { duration: DURATION.normal, ease: EASE.out },
  exit: { duration: DURATION.fast, ease: EASE.in },
} as const;

/** Max pointer-parallax travel — small on purpose, content must stay readable. */
export const PARALLAX_RANGE_PX = 14;

/** Default whileInView viewport — reveal once, don't replay on every scroll wobble. */
export const VIEWPORT_ONCE = { once: true, amount: 0.15 } as const;
