export type TourKind = "table" | "chair" | "sofa" | "counter" | "wall";

export type TourAction =
  | { type: "add"; kind: TourKind; label: string }
  | { type: "move"; direction: "left" | "right" | "forward" | "back"; meters: number }
  | { type: "clarify"; question: string }
  | { type: "none"; note: string };

export type TourAgentResult = {
  reply: string;
  action: TourAction;
};

const FURNITURE: { kind: TourKind; label: string; pattern: RegExp }[] = [
  { kind: "table", label: "Dining table", pattern: /\b(dining\s*)?tables?\b|\bbooths?\b/i },
  { kind: "chair", label: "Chair", pattern: /\bchairs?\b|\bseats?\b|\bstools?\b/i },
  { kind: "sofa", label: "Sofa", pattern: /\bsofas?\b|\bcouches?\b|\blounges?\b/i },
  { kind: "counter", label: "Service counter", pattern: /\bcounters?\b|\bbar\b|\bhost\s*stand\b|\bkitchen\b/i },
  { kind: "wall", label: "Interior wall", pattern: /\bwalls?\b|\bpartition\b|\bdivider\b/i },
];

const CYCLE: TourKind[] = ["table", "chair", "sofa", "counter", "wall"];

/**
 * Stand-in for the layout agent. Every message changes the room: a move slides the
 * last piece, anything else stages the next piece. The tour draws that immediately.
 */
export function tourAgentReply(message: string, placedCount: number): TourAgentResult {
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
