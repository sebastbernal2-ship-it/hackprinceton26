/**
 * The site page motion system ("survey in motion"). Every duration, curve and spring the page uses lives here and is
 * mirrored as CSS custom properties in app/site/[id]/site-motion.css. Documented in DESIGN.md, Motion.
 */

/** seconds */
export const DUR = {
  /** press, hover acknowledgement */
  instant: 0.12,
  /** routine state change: highlight, tooltip */
  quick: 0.2,
  /** a mark settling, a row arriving */
  state: 0.32,
  /** a dimension line drawing itself */
  draw: 0.7,
  /** a figure counting to its value */
  tween: 0.9,
  /** the hero entrance, once per visit */
  focal: 0.8,
} as const;

/** strong ease-out: arrivals, draws, tweens */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
/** on-screen movement between two states */
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

export const SPRING = {
  /** markers and stakes: critically damped, no overshoot */
  settle: { type: "spring", duration: 0.5, bounce: 0 },
  /** cost blocks dropping into the budget vessel */
  drop: { type: "spring", duration: 0.6, bounce: 0.16 },
  /** blocks re-flowing after the brief changes */
  reflow: { type: "spring", duration: 0.7, bounce: 0.1 },
  /** the lens following the pointer: fast, no overshoot */
  follow: { stiffness: 520, damping: 42, mass: 0.6 },
} as const;

/** stagger between siblings that arrive as a list, capped */
export const STAGGER = 0.05;
export const STAGGER_CAP = 0.5;

export const stagger = (i: number) => Math.min(i * STAGGER, STAGGER_CAP);
