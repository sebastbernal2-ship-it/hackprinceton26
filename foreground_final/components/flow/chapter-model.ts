/** The six chapters of a chosen space (docs/deal-flow-plan.md, section 1). Pure. */

export const CHAPTERS = ["overview", "walk", "layout", "room", "numbers", "deal"] as const;
export type Chapter = (typeof CHAPTERS)[number];

export const CHAPTER_LABEL: Record<Chapter, string> = {
  overview: "Overview",
  walk: "Walk",
  layout: "Layout",
  room: "Room",
  numbers: "Numbers",
  deal: "Deal",
};

/** the bone pill at the bottom of the Guide: always the next chapter */
export const NEXT_PILL: Record<Chapter, { to: Chapter; label: string } | null> = {
  overview: { to: "walk", label: "Walk the space" },
  walk: { to: "layout", label: "Lay it out" },
  layout: { to: "room", label: "See it in the room" },
  room: { to: "numbers", label: "Run the numbers" },
  numbers: { to: "deal", label: "Close the deal" },
  deal: null,
};

/** chapters that show the pano at full brightness; the rest sit over it dimmed */
export const BRIGHT_CHAPTERS: ReadonlySet<Chapter> = new Set<Chapter>(["walk", "room"]);

/** keys 1-6 jump, [ and ] step; null for any other key */
export function chapterForKey(key: string, current: Chapter): Chapter | null {
  if (/^[1-6]$/.test(key)) return CHAPTERS[Number(key) - 1];
  const i = CHAPTERS.indexOf(current);
  if (key === "[") return CHAPTERS[Math.max(0, i - 1)];
  if (key === "]") return CHAPTERS[Math.min(CHAPTERS.length - 1, i + 1)];
  return null;
}
