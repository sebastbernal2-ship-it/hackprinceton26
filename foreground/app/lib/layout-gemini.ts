import {
  customItem,
  EXTEND_PRICE_PER_METER,
  findCatalogItem,
  money,
  REMOVE_ROOM_PRICE,
  type LayoutDecision,
} from "./layout-catalog";
import { catalogPrompt, findRoom, pieceFits, type PlacedFootprint, type RoomMeasure } from "./layout-fit";
import { requireKey } from "./server-env";

const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"];

export async function decideLayout(input: {
  message: string;
  mode: "matterport" | "foreground";
  rooms: RoomMeasure[];
  placed: PlacedFootprint[];
  total: number;
}): Promise<LayoutDecision> {
  const raw = await askGemini(promptFor(input));
  return resolveDecision(raw, input);
}

function promptFor(input: {
  message: string;
  mode: "matterport" | "foreground";
  rooms: RoomMeasure[];
  placed: PlacedFootprint[];
  total: number;
}) {
  const rooms = input.rooms.map((room) => `${room.label}: ${room.width} m by ${room.depth} m, ${room.area} m²`).join("\n") || "No measured rooms yet.";
  const placed = input.placed.map((piece) => `${piece.item} in ${piece.room}, ${piece.width} m by ${piece.depth} m`).join("\n") || "Nothing placed yet.";
  return `You are the layout agent for a restaurant space. Decide what this sentence asks for. Return JSON only, with one of these shapes:
{"action":"add","item":"booth","size":"lounge","room":"Main Dining Room","reply":"short sentence"}
{"action":"remove-room","room":"Bath","reply":"short sentence"}
{"action":"extend","room":"Kitchen","into":"Bath","meters":1.6,"reply":"short sentence"}
{"action":"none","reply":"short sentence"}

Rules:
- For a catalog piece, item is the catalog id. For anything else the user names, item is that object name, such as booth, stool, kitchen, island, plant, or host stand. size must be one of small, seat, table, lounge, kitchen, run. Do not invent a price or a measurement.
- room and into must be a room name from the list below. When mode is foreground, that is the Imagine Tour, and walls can be removed or added there.
- extend meters is between 0.5 and 2.
- Use add for furniture. If they ask for several of one piece, still return one add for that item.
- Use remove-room when the user wants a room or its walls gone, including a bathroom or freezer. Use extend when they want one room to take space from another, including a bigger kitchen. If they do not name the room to take space from, set into to the smallest different room and meters to 1.6.
- Use none when the sentence is not one of those changes.
- The reply is one or two sentences. Do not mention the catalog ids.

Mode: ${input.mode}
Running total: ${money(input.total)}
Removing a room costs ${money(REMOVE_ROOM_PRICE)}. Extending a room costs ${money(EXTEND_PRICE_PER_METER)} per meter.

Catalog:
${catalogPrompt()}

Rooms:
${rooms}

Already placed:
${placed}

User: ${input.message}`;
}

function resolveDecision(
  raw: Record<string, unknown>,
  input: { message: string; mode: "matterport" | "foreground"; rooms: RoomMeasure[]; placed: PlacedFootprint[]; total: number },
): LayoutDecision {
  const action = String(raw.action || "none");
  const reply = String(raw.reply || "").trim();
  if (action === "add") {
    const item = findCatalogItem(String(raw.item || "")) ?? customItem(String(raw.item || raw.name || ""), String(raw.size || ""));
    if (!item) return { reply: reply || "Tell me which object to add.", total: input.total, action: { type: "none" } };
    const room = findRoom(input.rooms, String(raw.room || "")) ?? largestRoom(input.rooms);
    if (!room) return { reply: "I need a measured room before I can place that.", total: input.total, action: { type: "none" } };
    const fit = pieceFits(room, item, input.placed);
    if (!fit.ok) return { reply: fit.reply, total: input.total, action: { type: "none" } };
    const total = input.total + item.price;
    return {
      reply: finishReply(reply || `Placed a ${item.label.toLowerCase()} in ${room.label}. It is ${item.width} m by ${item.depth} m.`, total),
      total,
      action: { type: "add", item, room: room.label },
    };
  }
  if (action === "remove-room" || action === "extend") {
    if (input.mode === "matterport") {
      return {
        reply: "Wall changes happen in Imagine Tour. Switch to that toggle and ask again.",
        total: input.total,
        action: { type: "none" },
      };
    }
    if (action === "remove-room") {
      const room = findRoom(input.rooms, String(raw.room || ""));
      if (!room) return { reply: reply || "I can't find that room on this plan.", total: input.total, action: { type: "none" } };
      const total = input.total + REMOVE_ROOM_PRICE;
      return {
        reply: finishReply(reply || `Took down the walls around ${room.label}.`, total),
        total,
        action: { type: "structure", edit: { kind: "remove-room", room: room.label }, price: REMOVE_ROOM_PRICE },
      };
    }
    const room = findRoom(input.rooms, String(raw.room || ""));
    const into = findRoom(input.rooms, String(raw.into || ""));
    const meters = Math.max(0.5, Math.min(2, Number(raw.meters) || 1.6));
    if (!room || !into || room.id === into.id) {
      return { reply: reply || "I need two different rooms on this plan before I can move that wall.", total: input.total, action: { type: "none" } };
    }
    const price = Math.round(meters * EXTEND_PRICE_PER_METER);
    const total = input.total + price;
    return {
      reply: finishReply(reply || `Extended ${room.label} by ${meters.toFixed(1)} m into ${into.label}.`, total),
      total,
      action: { type: "structure", edit: { kind: "extend", room: room.label, into: into.label, meters }, price },
    };
  }
  return inferEdit(input, reply) ?? { reply: reply || "Tell me a piece to add, a room to remove, or a room to extend.", total: input.total, action: { type: "none" } };
}

function inferEdit(
  input: { message?: string; mode: "matterport" | "foreground"; rooms: RoomMeasure[]; total: number },
  reply: string,
): LayoutDecision | null {
  const message = input.message?.toLowerCase() || "";
  if (input.mode !== "foreground" || !input.rooms.length) return null;
  if (/remove|take down|get rid|delete/.test(message)) {
    const room = namedRoom(input.rooms, message);
    if (!room) return null;
    const total = input.total + REMOVE_ROOM_PRICE;
    return {
      reply: finishReply(reply || `Took down the walls around ${room.label}.`, total),
      total,
      action: { type: "structure", edit: { kind: "remove-room", room: room.label }, price: REMOVE_ROOM_PRICE },
    };
  }
  if (/extend|more space|bigger/.test(message)) {
    const room = namedRoom(input.rooms, message);
    const into = input.rooms.filter((entry) => entry.id !== room?.id).sort((left, right) => left.area - right.area)[0];
    if (!room || !into) return null;
    const meters = 1.6;
    const price = Math.round(meters * EXTEND_PRICE_PER_METER);
    const total = input.total + price;
    return {
      reply: finishReply(`Extended ${room.label} by ${meters.toFixed(1)} m into ${into.label}.`, total),
      total,
      action: { type: "structure", edit: { kind: "extend", room: room.label, into: into.label, meters }, price },
    };
  }
  return null;
}

function namedRoom(rooms: RoomMeasure[], message: string) {
  return (
    rooms.find((room) => message.includes(room.label.toLowerCase())) ??
    rooms.find((room) => {
      const word = room.label.toLowerCase().replace(/^main\s+/, "").replace(/\s+room$/, "");
      return word.length > 2 && message.includes(word);
    }) ??
    null
  );
}

function finishReply(reply: string, total: number) {
  return `${reply} Running total ${money(total)}.`;
}

function largestRoom(rooms: RoomMeasure[]) {
  return rooms.slice().sort((left, right) => right.area - left.area)[0] ?? null;
}

async function askGemini(prompt: string): Promise<Record<string, unknown>> {
  const key = requireKey("GEMINI_API_KEY");
  let lastError = "Gemini did not return a layout decision.";
  for (const model of MODELS) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
      }),
      cache: "no-store",
    });
    if (response.status === 404) {
      lastError = `${model} is not available.`;
      continue;
    }
    const body = (await response.json()) as {
      error?: { message?: string };
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    if (!response.ok) {
      lastError = body.error?.message || `Gemini request failed (${response.status}).`;
      if (response.status === 400 || response.status === 401 || response.status === 403) break;
      continue;
    }
    const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
    const parsed = parseJson(text);
    if (parsed) return parsed;
    lastError = "Gemini did not return a layout decision.";
  }
  throw new Error(lastError);
}

function parseJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1)) as unknown;
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
