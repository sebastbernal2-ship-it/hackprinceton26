import {
  CUSTOM_SHAPES,
  EXTEND_PRICE_PER_METER,
  findCatalogItem,
  type CatalogItem,
  type CustomShape,
  money,
  REMOVE_ROOM_PRICE,
  type LayoutDecision,
} from "./layout-catalog";
import { catalogPrompt, findRoom, pieceFits, type PlacedFootprint, type RoomMeasure } from "./layout-fit";
import { findOpenPhoto, findProductImage } from "./product-image";
import { serverEnv } from "./server-env";
import { ADD_WALL_PER_M, directionVector, REMOVE_SHELL_PER_M, REMOVE_WALL_PER_M } from "./wall-edits";

/** A numbered wall as the agent sees it. */
export type WallBrief = { number: number; length: number; role: string; between: string; removed?: boolean };

type Input = {
  message: string;
  mode: "matterport" | "foreground";
  rooms: RoomMeasure[];
  placed: PlacedFootprint[];
  total: number;
  walls?: WallBrief[];
  /** the property's CoStar / Matterport / Vexcel facts, as plain lines */
  facts?: string;
  /** the scan's lowest ceiling, metres: nothing taller goes in */
  ceilingM?: number;
};

const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"];

export async function decideLayout(input: Input): Promise<LayoutDecision> {
  const raw = await askGemini(promptFor(input));
  const steps = Array.isArray(raw.actions) ? (raw.actions as Record<string, unknown>[]).slice(0, 6) : [raw];
  // several changes in one sentence: resolve them in order, each on top of the running total
  const decisions: LayoutDecision[] = [];
  let total = input.total;
  const placed = [...input.placed];
  for (const step of steps) {
    if (!step || typeof step !== "object") continue;
    const decision = resolveDecision(step, { ...input, total, placed });
    decisions.push(decision);
    total = decision.total;
    if (decision.action.type === "add") {
      for (let i = 0; i < (decision.action.count ?? 1); i += 1) {
        placed.push({ item: decision.action.item.label, room: decision.action.room, width: decision.action.item.width, depth: decision.action.item.depth });
      }
    }
  }
  if (!decisions.length) return resolveDecision({}, input);
  // a real photo for each product: its own page first, then the pages Gemini's search read
  await Promise.all(
    decisions.map(async (d) => {
      if (d.action.type !== "add" || !d.action.item.product) return;
      const product = d.action.item.product;
      // a Google Shopping search for the exact product, so the owner can always see the real thing
      const google = `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(product.name)}`;
      const found = await findProductImage([product.url, ...(raw.__sources ?? [])].filter((u): u is string => Boolean(u)));
      if (found) {
        d.action.item.product = { ...product, url: found.page, google, image: `/api/product-image?u=${encodeURIComponent(found.image)}` };
        return;
      }
      // the shop page could not be read (missing, or it blocks automated visits): an open photo of the same thing.
      // The agent's page link is dropped then, since it may not exist; the Google link always works.
      const open = await findOpenPhoto([product.name, d.action.item.label]);
      d.action.item.product = {
        name: product.name,
        google,
        ...(open ? { image: `/api/product-image?u=${encodeURIComponent(open.image)}`, credit: open.credit, photoPage: open.page } : {}),
      };
    }),
  );
  const real = decisions.filter((d) => d.action.type !== "none");
  const reply = decisions.map((d) => d.reply.replace(/\s*Running total [^.]*\.$/, "")).join(" ");
  return {
    reply: finishReply(reply, total),
    total,
    action: (real[0] ?? decisions[0]).action,
    actions: real.map((d) => d.action),
  };
}

function promptFor(input: Input) {
  const rooms =
    input.rooms
      .map((room) => `${room.label}: ${room.width} m by ${room.depth} m, ${room.area} m²${room.freeArea !== undefined ? `, ${room.freeArea} m² still free` : ""}${room.note ? ` (${room.note})` : ""}`)
      .join("\n") || "No measured rooms yet.";
  const placed = input.placed.map((piece) => `${piece.item} in ${piece.room}, ${piece.width} m by ${piece.depth} m`).join("\n") || "Nothing placed yet.";
  const walls =
    (input.walls ?? [])
      .map((w) => `Wall ${w.number}: ${w.length.toFixed(1)} m, ${w.role === "shell" ? "outside wall" : w.role === "added" ? "new wall" : "interior wall"}, ${w.between}${w.removed ? " (REMOVED)" : ""}`)
      .join("\n") || "No walls numbered yet.";
  return `You are the layout agent for a restaurant space shown as a 3D model. The owner types a change; decide it. Return JSON only, one of:
{"action":"add","item":"dining-table","room":"Main Dining Room","count":1,"reply":"short sentence"}
{"action":"add-custom","name":"<what they asked for>","product":"<brand and model you found>","productUrl":"<https link to that product's page>","shape":"<one shape>","width":0,"depth":0,"height":0,"color":"#rrggbb","price":0,"room":"<room>","count":1,"reply":"short sentence"}
{"action":"remove-walls","walls":[2,5],"reply":"short sentence"}
{"action":"restore-walls","walls":[2],"reply":"short sentence"}
{"action":"add-wall","between":[8,13],"reply":"short sentence"}
{"action":"add-wall","near":4,"offset":1.2,"reply":"short sentence"}
{"action":"add-wall","room":"Main Dining Room","orientation":"horizontal","position":0.5,"reply":"short sentence"}
{"action":"move-wall","walls":[11],"direction":"left","meters":1.5,"reply":"short sentence"}
{"action":"move-object","item":"fish tank","count":1,"direction":"right","meters":1,"reply":"short sentence"}
{"action":"remove-room","room":"Bath","reply":"short sentence"}
{"action":"extend","room":"Kitchen","into":"Bath","meters":1.6,"reply":"short sentence"}
{"action":"none","reply":"short sentence"}
When the sentence asks for several changes, return {"actions":[ ...one object per change, each shaped like the above... ]}.

Rules:
- REAL PRODUCTS: for every object the owner asks for (a sofa, chairs, a table, an oven, a piano...), search the web and pick ONE real product currently sold (brand and model) that suits a restaurant and FITS the room it goes in, leaving at least 0.6 m to walk around it. Use add-custom with that product's real width, depth and height in metres from its listing, its real price in US dollars, its colour as a hex value, "product" set to the brand and model name, and "productUrl" set to the product's own page (a shop or brand page, not a search page). If the first product you find does not fit, pick a smaller one.
- Use add (catalog ids) only if web search is unavailable. For ANY other object (a piano, a pizza oven, a fish tank, a bookshelf, a neon sign, a plant, a TV...), use add-custom with realistic real-world size in metres, a hex colour that matches the object, a typical US price in dollars for buying and installing it, and shape from: ${CUSTOM_SHAPES.join(", ")} (glass = see-through, like a fish tank or display case; height is the full height including any stand). Never refuse an object.
- If you are unsure of an object's real size or price, search the web first, then answer with JSON only (no prose, no code fences).
- count is how many to place, 1 to 8.
- room must be a room name from the list. If they do not say, pick the most sensible room.
- Walls are numbered. "remove wall 3", "take down walls 1, 2 and 4", "knock out wall 7" -> remove-walls with those numbers. "put wall 3 back" -> restore-walls.
- move-wall slides walls the owner added (marked "new wall") left, right, forward or back by 0.1 to 10 metres. Moving is free. Only new walls can move; for a scanned wall, tell them to remove it and add a new one.
- move-object slides already-placed objects left, right, forward or back; count is how many of that object to move (default 1, the latest one). Moving is free.
- add-wall: "between wall A and wall B" -> {"between":[A,B]} (a wall joining those two walls). "near wall N" / "next to wall N" / "parallel to wall N" -> {"near":N,"offset":metres into the room, default 1.2}. Otherwise across a room as below. Use the wall numbers the owner says; never invent one.
- add-wall across a room splits a room with a new partition: orientation "horizontal" runs left to right, "vertical" runs front to back; position is 0.15 to 0.85 across the room.
- remove-room takes down every wall around a room; extend grows one room into another by 0.5 to 2 metres.
- The reply is one or two plain sentences: name the product and its size when you add one. Mention wall numbers when walls change. Do not mention catalog ids.

The rooms below are the space AS IT IS NOW: removed walls have merged rooms into open plan, added walls have split rooms, and "still free" is the floor left after what is already placed. Size everything against these numbers, never the original plan. Nothing may be taller than the ceiling. A new wall must leave each part at least 1.2 m deep.
${input.facts ? `\nProperty facts (CoStar listing, Matterport scan, Vexcel aerial):\n${input.facts}\n` : ""}
Running total: ${money(input.total)}
Prices: removing an interior wall ${money(REMOVE_WALL_PER_M)}/m, an outside wall ${money(REMOVE_SHELL_PER_M)}/m (structural), a new wall ${money(ADD_WALL_PER_M)}/m, removing a room ${money(REMOVE_ROOM_PRICE)}, extending ${money(EXTEND_PRICE_PER_METER)}/m.

Catalog:
${catalogPrompt()}

Rooms:
${rooms}

Walls:
${walls}

Already placed:
${placed}

User: ${input.message}`;
}

/** The structure's limits: the scan's ceiling height and the floor still free in the space as it is now. */
function structuralCheck(item: CatalogItem, room: RoomMeasure, count: number, input: Input): string | null {
  const name = item.product?.name ?? item.label;
  const height = item.custom?.height;
  if (input.ceilingM && height && height > input.ceilingM - 0.1) {
    return `${name} is ${height.toFixed(2)} m tall, but the ceiling here is only ${input.ceilingM.toFixed(2)} m. Ask for a lower one.`;
  }
  const footprint = item.width * item.depth * count;
  if (room.freeArea !== undefined && footprint > room.freeArea * 0.85) {
    return `${count > 1 ? `${count} of ${name}` : name} need${count > 1 ? "" : "s"} about ${footprint.toFixed(1)} m², but ${room.label} has only ${room.freeArea.toFixed(1)} m² of free floor left (counting walking space). Remove something or pick a smaller one.`;
  }
  return null;
}

function num(v: unknown, min: number, max: number, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function wallNumbers(raw: unknown, input: Input): number[] {
  const known = new Set((input.walls ?? []).map((w) => w.number));
  const list = Array.isArray(raw) ? raw : [raw];
  return [...new Set(list.map((v) => Math.round(Number(v))).filter((n) => known.has(n)))];
}

function resolveDecision(raw: Record<string, unknown>, input: Input): LayoutDecision {
  const action = String(raw.action || "none");
  const reply = String(raw.reply || "").trim();
  const count = Math.round(num(raw.count, 1, 8, 1));
  if (action === "add-custom") {
    const name = String(raw.name || raw.item || "object").trim().slice(0, 40) || "object";
    const shape = (CUSTOM_SHAPES as string[]).includes(String(raw.shape)) ? (String(raw.shape) as CustomShape) : "box";
    const item: CatalogItem = {
      id: `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      label: name.charAt(0).toUpperCase() + name.slice(1),
      kind: "custom",
      width: Math.round(num(raw.width, 0.1, 6, 0.8) * 100) / 100,
      depth: Math.round(num(raw.depth, 0.1, 6, 0.8) * 100) / 100,
      price: Math.round(num(raw.price, 0, 250_000, 500)),
      custom: { height: Math.round(num(raw.height, 0.05, 4, 1) * 100) / 100, color: String(raw.color || "#8d6844"), shape },
      product: raw.product ? { name: String(raw.product).slice(0, 80), url: typeof raw.productUrl === "string" ? raw.productUrl.slice(0, 500) : undefined } : undefined,
    };
    const room = findRoom(input.rooms, String(raw.room || "")) ?? largestRoom(input.rooms);
    if (!room) return { reply: "I need a measured room before I can place that.", total: input.total, action: { type: "none" } };
    const fit = pieceFits(room, item, input.placed);
    if (!fit.ok) return { reply: `${item.product?.name ?? item.label}: ${fit.reply}`, total: input.total, action: { type: "none" } };
    const roomCheck = structuralCheck(item, room, count, input);
    if (roomCheck) return { reply: roomCheck, total: input.total, action: { type: "none" } };
    const total = input.total + item.price * count;
    return {
      reply: finishReply(reply || `Placed ${count > 1 ? `${count} ${item.label.toLowerCase()}s` : `a ${item.label.toLowerCase()}`} in ${room.label}.`, total),
      total,
      action: { type: "add", item, room: room.label, count },
    };
  }
  if (action === "remove-walls" || action === "restore-walls") {
    const numbers = wallNumbers(raw.walls, input);
    if (!numbers.length) return { reply: reply || "Tell me which wall numbers to change; they are shown on the model.", total: input.total, action: { type: "none" } };
    const byNumber = new Map((input.walls ?? []).map((w) => [w.number, w]));
    const sign = action === "remove-walls" ? 1 : -1;
    const price = numbers.reduce((sum, n) => {
      const w = byNumber.get(n)!;
      return sum + Math.round(w.length * (w.role === "shell" ? REMOVE_SHELL_PER_M : w.role === "added" ? 0 : REMOVE_WALL_PER_M));
    }, 0);
    const total = Math.max(0, input.total + sign * price);
    return {
      reply: finishReply(reply || `${sign > 0 ? "Taking down" : "Putting back"} wall${numbers.length > 1 ? "s" : ""} ${numbers.join(", ")}.`, total),
      total,
      action: { type: "walls", remove: sign > 0 ? numbers : [], restore: sign < 0 ? numbers : [], add: [], price: sign * price },
    };
  }
  if (input.mode === "matterport" && ["remove-walls", "restore-walls", "add-wall", "move-wall"].includes(action)) {
    return {
      reply: "Walls change in the Imagine tour, where every wall is numbered. Switch to Imagine and ask again.",
      total: input.total,
      action: { type: "none" },
    };
  }
  if (action === "move-wall") {
    const numbers = wallNumbers(raw.walls ?? raw.wall, input);
    const byNumber = new Map((input.walls ?? []).map((w) => [w.number, w]));
    const movable = numbers.filter((n) => byNumber.get(n)?.role === "added");
    if (!movable.length) {
      return {
        reply: numbers.length
          ? `Only walls you added can be moved. To shift wall ${numbers.join(", ")}, remove it and add a new one where you want it.`
          : reply || "Tell me which added wall to move, for example “move wall 11 left 1 m”.",
        total: input.total,
        action: { type: "none" },
      };
    }
    const { dx, dz } = directionVector(String(raw.direction || "left"), num(raw.meters, 0.1, 10, 1));
    return {
      reply: finishReply(reply || `Moved wall${movable.length > 1 ? "s" : ""} ${movable.join(", ")}. No charge for moving.`, input.total),
      total: input.total,
      action: { type: "walls", remove: [], restore: [], add: [], move: movable.map((wall) => ({ wall, dx, dz })), price: 0 },
    };
  }
  if (action === "move-object") {
    const item = String(raw.item || raw.name || "").trim();
    const { dx, dz } = directionVector(String(raw.direction || "right"), num(raw.meters, 0.1, 10, 1));
    return {
      reply: finishReply(reply || `Moved the ${item || "last piece"}. No charge for moving.`, input.total),
      total: input.total,
      action: { type: "move-piece", item, dx, dz, count: Math.round(num(raw.count, 1, 8, 1)) },
    };
  }
  if (action === "add-wall") {
    const known = new Set((input.walls ?? []).map((w) => w.number));
    const byNumber = new Map((input.walls ?? []).map((w) => [w.number, w]));
    const pair = Array.isArray(raw.between) ? raw.between.map((v) => Math.round(Number(v))).filter((n) => known.has(n)) : [];
    const near = raw.near !== undefined && known.has(Math.round(Number(raw.near))) ? Math.round(Number(raw.near)) : undefined;
    if (pair.length === 2) {
      // the real length is measured when the wall is built; this is only the agent's estimate
      const price = Math.round(3 * ADD_WALL_PER_M);
      return {
        reply: finishReply(reply || `Adding a wall between walls ${pair[0]} and ${pair[1]}.`, input.total + price),
        total: input.total + price,
        action: { type: "walls", remove: [], restore: [], add: [{ between: [pair[0], pair[1]] }], price },
      };
    }
    if (near !== undefined) {
      const length = byNumber.get(near)?.length ?? 3;
      const price = Math.round(length * ADD_WALL_PER_M);
      return {
        reply: finishReply(reply || `Adding a wall beside wall ${near}.`, input.total + price),
        total: input.total + price,
        action: { type: "walls", remove: [], restore: [], add: [{ near, offset: num(raw.offset, 0.6, 6, 1.2) }], price },
      };
    }
    const room = findRoom(input.rooms, String(raw.room || "")) ?? largestRoom(input.rooms);
    if (!room) return { reply: "I need a measured room before I can add a wall.", total: input.total, action: { type: "none" } };
    const orientation = String(raw.orientation) === "vertical" ? "vertical" : "horizontal";
    const length = orientation === "horizontal" ? room.width : room.depth;
    const across = orientation === "horizontal" ? room.depth : room.width;
    if (across < 2.4) {
      return {
        reply: `${room.label} is only ${across.toFixed(1)} m ${orientation === "horizontal" ? "deep" : "wide"}, so a wall across it would leave parts under 1.2 m. Try the other direction or a bigger room.`,
        total: input.total,
        action: { type: "none" },
      };
    }
    const price = Math.round(length * ADD_WALL_PER_M);
    const total = input.total + price;
    return {
      reply: finishReply(reply || `Adding a ${length.toFixed(1)} m wall across ${room.label}.`, total),
      total,
      action: { type: "walls", remove: [], restore: [], add: [{ room: room.label, orientation, position: num(raw.position, 0.15, 0.85, 0.5) }], price },
    };
  }
  if (action === "add") {
    const item = findCatalogItem(String(raw.item || ""));
    if (!item) return { reply: reply || "That piece is not in the catalog.", total: input.total, action: { type: "none" } };
    const room = findRoom(input.rooms, String(raw.room || "")) ?? largestRoom(input.rooms);
    if (!room) return { reply: "I need a measured room before I can place that.", total: input.total, action: { type: "none" } };
    const fit = pieceFits(room, item, input.placed);
    if (!fit.ok) return { reply: fit.reply, total: input.total, action: { type: "none" } };
    const roomCheck = structuralCheck(item, room, count, input);
    if (roomCheck) return { reply: roomCheck, total: input.total, action: { type: "none" } };
    const total = input.total + item.price * count;
    return {
      reply: finishReply(reply || `Placed ${count > 1 ? `${count} of them` : `a ${item.label.toLowerCase()}`} in ${room.label}. Each is ${item.width} m by ${item.depth} m.`, total),
      total,
      action: { type: "add", item, room: room.label, count },
    };
  }
  if (action === "remove-room" || action === "extend") {
    if (input.mode === "matterport") {
      return {
        reply: "Wall changes happen in the Imagine tour. Switch to that toggle and ask again.",
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

function inferEdit(input: Input, reply: string): LayoutDecision | null {
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

async function askGemini(prompt: string): Promise<Record<string, unknown> & { __sources?: string[] }> {
  const key = serverEnv("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is missing on the server.");
  let lastError = "Gemini did not return a layout decision.";
  for (const model of MODELS) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        // Google Search grounding: Gemini looks up real sizes and prices when an object is unfamiliar.
        // (JSON mode cannot be combined with a tool, so the prompt asks for JSON and parseJson reads it.)
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.1, thinkingConfig: { thinkingBudget: 0 } },
      }),
      cache: "no-store",
    });
    if (response.status === 404) {
      lastError = `${model} is not available.`;
      continue;
    }
    const body = (await response.json()) as {
      error?: { message?: string };
      candidates?: { content?: { parts?: { text?: string }[] }; groundingMetadata?: { groundingChunks?: { web?: { uri?: string } }[] } }[];
    };
    if (!response.ok) {
      lastError = body.error?.message || `Gemini request failed (${response.status}).`;
      if (response.status === 400 || response.status === 401 || response.status === 403) break;
      continue;
    }
    const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
    const parsed = parseJson(text);
    if (parsed) {
      const sources = (body.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []).flatMap((chunk) => (chunk.web?.uri ? [chunk.web.uri] : []));
      return { ...parsed, __sources: sources };
    }
    lastError = "Gemini did not return a layout decision.";
  }
  throw new Error(lastError);
}

function parseJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) {
    try {
      const list = JSON.parse(trimmed.slice(0, trimmed.lastIndexOf("]") + 1)) as unknown;
      if (Array.isArray(list)) return { actions: list };
    } catch {
      // fall through to the object reader
    }
  }
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
