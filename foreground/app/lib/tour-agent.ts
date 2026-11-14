import { fetchTourAgent } from "./api";
import { DEMO_FALLBACK } from "./demo-flag";

export type TourKind = "table" | "chair" | "sofa" | "counter" | "wall";

export type TourAction =
  | { type: "add"; kind: TourKind; label: string }
  | { type: "move"; direction: "left" | "right" | "forward" | "back"; meters: number }
  | { type: "clarify"; question: string }
  | { type: "none"; note: string };

export type TourAgentResult = {
  reply: string;
  action: TourAction;
  /** True when the reply comes from a placeholder, not a layout model. */
  stub?: boolean;
};

const FURNITURE: { kind: TourKind; label: string; pattern: RegExp }[] = [
  { kind: "table", label: "Dining table", pattern: /\b(dining\s*)?tables?\b|\bbooths?\b/i },
  { kind: "chair", label: "Chair", pattern: /\bchairs?\b|\bseats?\b|\bstools?\b/i },
  { kind: "sofa", label: "Sofa", pattern: /\bsofas?\b|\bcouches?\b|\blounges?\b/i },
  { kind: "counter", label: "Service counter", pattern: /\bcounters?\b|\bbar\b|\bhost\s*stand\b|\bkitchen\b/i },
  { kind: "wall", label: "Interior wall", pattern: /\bwalls?\b|\bpartition\b|\bdivider\b/i },
];

const CYCLE: TourKind[] = ["table", "chair", "sofa", "counter", "wall"];

/** Asks the API's layout agent (a labelled stub for now). Unreachable API: no change to the room. */
export async function tourAgentReply(message: string, placedCount: number, tourId: string): Promise<TourAgentResult> {
  try {
    return await fetchTourAgent(message, placedCount, tourId);
  } catch {
    if (DEMO_FALLBACK) return { ...demoTourReply(message, placedCount), stub: true };
    return { reply: "The layout agent is unreachable, so nothing changed in the room.", action: { type: "none", note: "api-unreachable" } };
  }
}

/** Demo-only: every message changes the room. Used with NEXT_PUBLIC_DEMO_FALLBACK=1. */
function demoTourReply(message: string, placedCount: number): TourAgentResult {
  const lower = message.trim().toLowerCase();
  const named = FURNITURE.find((item) => item.pattern.test(message));
  const wantsMove = /\b(move|shift|slide|nudge|push)\b/.test(lower) && placedCount > 0;

  if (wantsMove) {
    const direction = /\bright\b/.test(lower)
      ? "right"
      : /\bleft\b/.test(lower)
        ? "left"
        : /\b(back|backward|away)\b/.test(lower)
          ? "back"
          : "forward";
    return {
      reply: `Moved it ${direction}. It’s in the tour now.`,
      action: { type: "move", direction, meters: 0.75 },
    };
  }

  const item = named ?? FURNITURE.find((entry) => entry.kind === CYCLE[placedCount % CYCLE.length])!;
  return {
    reply: `Placed a ${item.label.toLowerCase()} in this room.`,
    action: { type: "add", kind: item.kind, label: item.label },
  };
}

export function furnitureTone(kind: TourKind): { accent: string; soft: string; glyph: string } {
  switch (kind) {
    case "table":
      return { accent: "#c45a2c", soft: "#f0ddd2", glyph: "▦" };
    case "chair":
      return { accent: "#8a6a45", soft: "#efe4d6", glyph: "▣" };
    case "sofa":
      return { accent: "#6b5b4a", soft: "#ebe4dc", glyph: "▬" };
    case "counter":
      return { accent: "#5f6d4e", soft: "#e3e7da", glyph: "▭" };
    case "wall":
      return { accent: "#4a5560", soft: "#dde2e6", glyph: "┃" };
  }
}
