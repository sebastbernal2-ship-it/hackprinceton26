/**
 * The flow's motion system (docs/design-v2.md, section 3). Every duration, curve and spring the flow uses lives
 * here. The old pages keep components/site/motion-tokens.ts.
 */

/** seconds */
export const DUR = { press: 0.1, quick: 0.18, state: 0.3, reveal: 0.5, count: 0.9, draw: 1.2, glide: 1.4 } as const;

export const EASE = {
  out: [0.23, 1, 0.32, 1],
  inOut: [0.77, 0, 0.175, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

export const SPRING = {
  /** default for everything */
  ui: { type: "spring", duration: 0.4, bounce: 0 },
  /** shared-element moves, panel resize */
  morph: { type: "spring", duration: 0.7, bounce: 0 },
  /** bottom sheet after a drag release only */
  sheet: { type: "spring", duration: 0.35, bounce: 0.15 },
  /** a chip or card the user just tapped */
  pop: { type: "spring", duration: 0.45, bounce: 0.2 },
} as const;

/** siblings arriving as a group; cap the total at STAGGER_CAP */
export const STAGGER = 0.06;
export const STAGGER_CAP = 0.36;
/** assistant text reveal, characters per second */
export const STREAM_CPS = 90;
/** an example chip typing itself into the composer, characters per second */
export const TYPE_CPS = 40;
/** exits mirror the entrance at 0.6x the duration */
export const EXIT_SCALE = 0.6;
/** the cross-fade every move becomes under reduced motion */
export const REDUCED = { duration: 0.2, ease: "linear" } as const;

/** Ask backdrop loop: hold, cross-fade (seconds) */
export const BACKDROP = { every: 9, fade: 1.6 } as const;

/** delay for the i-th sibling of a group, capped */
export function stagger(i: number): number {
  return Math.min(i * STAGGER, STAGGER_CAP);
}

/** how long a text takes to stream in, capped so nothing waits on a long paragraph */
export function streamSeconds(text: string, cap = 1.6): number {
  return Math.min(text.length / STREAM_CPS, cap);
}

/** layoutIds, all inside one <LayoutGroup id="flow"> */
export const LAYOUT = {
  composer: "composer",
  chatSurface: "chat-surface",
  spaceMedia: (siteId: string) => `space-media-${siteId}`,
  spaceTitle: (siteId: string) => `space-title-${siteId}`,
} as const;
