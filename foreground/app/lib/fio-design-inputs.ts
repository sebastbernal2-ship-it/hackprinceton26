// Inputs for "Design my place" read from what the owner already said, and the phrases that ask for it.
import type { Concept } from "./auto-design";
import type { Exchange } from "./next-question";

export const CONCEPTS: { key: Concept; label: string }[] = [
  { key: "cafe", label: "Cafe" },
  { key: "grab-and-go", label: "Grab-and-go" },
  { key: "full-service", label: "Full-service" },
  { key: "frozen-yogurt", label: "Frozen yogurt" },
];

/** Seats the owner asked for in the intake brief ("24 to 40 seats" gives the middle, 32; "30 seats" gives 30), or null. */
export function briefSeats(brief: Exchange[]): number | null {
  const said = brief.map((b) => b.answer).join(" ");
  const range = /(\d{1,3})\s*(?:to|-|–|and)\s*(\d{1,3})\s*seats?\b/i.exec(said);
  if (range) return Math.round((Number(range[1]) + Number(range[2])) / 2);
  const one = /(\d{1,3})\s*seats?\b/i.exec(said);
  return one ? Number(one[1]) : null;
}

const DESIGN = /\b(design|lay\s*out|auto[- ]?design|furnish|fit\s*out|set\s*up)\b.*\b(my|the|this|our)\b.*\b(place|space|cafe|shop|room|store|floor)\b|\bdesign (it|this|everything)\b|^design\b/i;
/** True when the text asks Fio to design the whole place; `concept` is set when the text names one. */
export function designIntent(text: string): { concept?: Concept } | null {
  const s = text.trim();
  if (!DESIGN.test(s)) return null;
  const concept: Concept | undefined = /frozen|yogurt|froyo/i.test(s) ? "frozen-yogurt" : /grab/i.test(s) ? "grab-and-go" : /full[- ]service|restaurant/i.test(s) ? "full-service" : /caf[eé]/i.test(s) && /\bas\b|\ba\b/i.test(s) ? "cafe" : undefined;
  return { concept };
}
