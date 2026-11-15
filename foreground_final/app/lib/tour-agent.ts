import type { StructureEdit } from "./floor-layout";

export type TourKind = "table" | "chair" | "sofa" | "counter" | "wall" | "custom";

export type TourMode = "matterport" | "foreground";

export type TourAgentContext = {
  mode: TourMode;
  freezerRemoved: boolean;
  hasFreezer?: boolean;
};

export type TourAction =
  | { type: "add"; kind: TourKind; label: string }
  | { type: "move"; direction: "left" | "right" | "forward" | "back"; meters: number }
  | { type: "structure"; edit: StructureEdit }
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
export function tourAgentReply(message: string, placedCount: number, context: TourAgentContext): TourAgentResult {
  const structural = structureReply(message, context);
  if (structural) return structural;

  if (context.mode === "foreground") {
    return {
      reply: "Furniture shows up in Matterport Tour. Here I can move walls — try removing the freezer, or giving the dining room more space.",
      action: { type: "none", note: "furniture-on-foreground" },
    };
  }

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

function structureReply(message: string, context: TourAgentContext): TourAgentResult | null {
  const text = message.toLowerCase();
  const freezer = /freezer|cooler|walk-in|cold room/.test(text);
  const dining = /dining|living|seating|front of house/.test(text);
  const kitchen = /kitchen/.test(text);
  const more = /more space|bigger|larger|expand|widen|grow/.test(text);
  const less = /less space|smaller|shrink|minimize|reduce|narrow/.test(text);
  const remove = /remov|delet|get rid|take out|knock|open up|merge|absorb|without/.test(text);
  const restore = /bring back|put back|add the freezer|restore|put the freezer/.test(text);
  const wallShift = /wall/.test(text) && /shift|move|slide|push/.test(text);
  const removeWall = /wall/.test(text) && remove;
  const aboutRooms = (dining || kitchen) && (more || less);
  if (!freezer && !wallShift && !aboutRooms && !removeWall) return null;

  let result: TourAgentResult;
  if ((freezer || removeWall) && restore) {
    result = context.freezerRemoved
      ? context.hasFreezer
        ? { reply: "The freezer is back, walled off from the kitchen.", action: { type: "structure", edit: { kind: "restore-freezer" } } }
        : { reply: "The wall between the dining room and the kitchen is back.", action: { type: "structure", edit: { kind: "restore-freezer" } } }
      : { reply: "That wall is still up.", action: { type: "none", note: "freezer-present" } };
  } else if (removeWall || (freezer && (remove || (kitchen && /take|space|into|that/.test(text))))) {
    result = context.freezerRemoved
      ? {
          reply: "That wall is already down. I can still shift what remains between the dining room and the kitchen.",
          action: { type: "none", note: "freezer-gone" },
        }
      : context.hasFreezer
        ? {
            reply: "Removed the freezer. The kitchen now includes that space.",
            action: { type: "structure", edit: { kind: "remove-freezer" } },
          }
        : {
            reply: "Took down the wall between the dining room and the kitchen.",
            action: { type: "structure", edit: { kind: "remove-freezer" } },
          };
  } else if ((more && dining) || (less && kitchen) || (wallShift && /right/.test(text))) {
    result = {
      reply: "Shifted the wall. The dining room is wider, and the kitchen is narrower.",
      action: { type: "structure", edit: { kind: "shift-wall", meters: 1.6 } },
    };
  } else if ((more && kitchen) || (less && dining) || (wallShift && /left/.test(text)) || wallShift) {
    result = {
      reply: "Shifted the wall. The kitchen is wider, and the dining room is narrower.",
      action: { type: "structure", edit: { kind: "shift-wall", meters: -1.6 } },
    };
  } else {
    result = {
      reply: "I can remove the freezer, put it back, or shift the wall between the dining room and the kitchen.",
      action: { type: "clarify", question: "Which wall should move?" },
    };
  }

  if (context.mode === "matterport" && result.action.type === "structure") {
    return {
      reply: "Wall changes happen in Foreground Tour. Switch to that toggle and ask again.",
      action: { type: "none", note: "structure-on-matterport" },
    };
  }
  return result;
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
    default:
      return { accent: "#3f8f55", soft: "#e3e7da", glyph: "◆" };
  }
}
