import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { requireKey } from "./server-env";
import type { PlanRoomPixels } from "./floor-layout";

const MODELS = ["gpt-4o", "gpt-4o-mini"];

const roomsByModel = new Map<string, PlanRoomPixels[]>();

export async function traceFloorplan(
  modelId: string,
  bytes: Buffer,
  mimeType: string,
  size: { width: number; height: number },
): Promise<PlanRoomPixels[]> {
  const cacheKey = `${modelId}:photo2`;
  const cached = roomsByModel.get(cacheKey);
  if (cached) return cached;

  const prepared = await visionImage(bytes, size.width, size.height, mimeType);
  const first = await requestRooms(prepared.bytes, prepared.mimeType, prepared.width, prepared.height, false);
  const accepted = largestShare(first, prepared.width * prepared.height) >= 0.04
    ? first
    : await requestRooms(prepared.bytes, prepared.mimeType, prepared.width, prepared.height, true);
  if (accepted.length === 0) throw new Error("Gemini did not name any rooms on this floorplan.");
  const scaled = accepted.map((room) => ({
    label: room.label,
    pixels: room.pixels.map(([x, y]) => [x * prepared.scale, y * prepared.scale] as [number, number]),
  }));
  if (largestShare(scaled, size.width * size.height) >= 0.04) roomsByModel.set(cacheKey, scaled);
  return scaled;
}

async function requestRooms(bytes: Buffer, mimeType: string, width: number, height: number, retry: boolean): Promise<PlanRoomPixels[]> {
  // The vision call uses the OpenAI key (OPENAI_API_KEY); the file name is historical.
  const key = requireKey("OPENAI_API_KEY");
  const prompt = roomPrompt(width, height, retry);
  let lastError = "The vision model did not return room polygons.";
  for (const model of MODELS) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${bytes.toString("base64")}` } },
        ] }],
      }),
      cache: "no-store",
    });
    if (response.status === 404) {
      lastError = `${model} is not available.`;
      continue;
    }
    const body = (await response.json()) as { error?: { message?: string }; choices?: { message?: { content?: string } }[] };
    if (!response.ok) {
      lastError = body.error?.message || `Vision request failed (${response.status}).`;
      if (response.status === 400 || response.status === 401 || response.status === 403) break;
      continue;
    }
    const rooms = parseRooms(body.choices?.[0]?.message?.content || "");
    if (rooms.length > 0) return rooms;
    lastError = "The vision model did not name any rooms on this floorplan.";
  }
  throw new Error(lastError);
}

function roomPrompt(width: number, height: number, retry: boolean): string {
  return `This is a top-down photogrammetry floorplan, ${width} by ${height} pixels. Dark gray is outside the building. Trace the floor of each room, wall to wall.

Return JSON only:
{"rooms":[{"label":"Main Dining Room","points":[[x,y]]}]}

Coordinates are pixels of this image. x starts at the left edge and increases right. y starts at the top edge and increases down.

Use these names when they match what you see:
- Main Dining Room: the large area with dining tables and booths.
- Kitchen: the tiled service area with counters and equipment.
- Freezer: a small closed room inside the kitchen or on its edge, even when the word is not printed. Omit it only if no separate small room is there.
- Bar: the counter with stools.
- Bath, Office, Storage, Hallway, or Front for the smaller rooms.

Each polygon must cover the whole floor of that room, including the furniture. Do not trace labels, the scale bar, or the legend. Use 8 to 20 corners. The dining room and the kitchen are large parts of the building.
${retry ? "The previous polygons only circled small details. Draw the full floor of each room instead." : ""}`;
}

async function visionImage(bytes: Buffer, width: number, height: number, mimeType: string) {
  const longEdge = Math.max(width, height);
  if (longEdge <= 1400) return { bytes, mimeType, width, height, scale: 1 };
  const dir = await mkdtemp(path.join(tmpdir(), "foreground-plan-"));
  try {
    const input = path.join(dir, "in.jpg");
    const output = path.join(dir, "out.jpg");
    await writeFile(input, bytes);
    await new Promise<void>((resolve, reject) => {
      const child = spawn("sips", ["-Z", "1400", input, "--out", output, "-s", "format", "jpeg"]);
      child.on("error", reject);
      child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("Could not resize the floorplan."))));
    });
    const smaller = await readFile(output);
    const scale = longEdge / 1400;
    return {
      bytes: smaller,
      mimeType: "image/jpeg",
      width: width >= height ? 1400 : Math.round(width / scale),
      height: height > width ? 1400 : Math.round(height / scale),
      scale,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function largestShare(rooms: PlanRoomPixels[], imageArea?: number): number {
  const area = imageArea ?? 1;
  if (!imageArea) return 0;
  let largest = 0;
  for (const room of rooms) {
    let sum = 0;
    for (let index = 0; index < room.pixels.length; index += 1) {
      const next = room.pixels[(index + 1) % room.pixels.length];
      sum += room.pixels[index][0] * next[1] - next[0] * room.pixels[index][1];
    }
    largest = Math.max(largest, Math.abs(sum) / 2);
  }
  return largest / area;
}

function parseRooms(text: string): PlanRoomPixels[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  const source = parsed as { rooms?: unknown };
  const rooms = Array.isArray(source.rooms) ? source.rooms : Array.isArray(parsed) ? parsed : [];
  return rooms.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as { label?: unknown; name?: unknown; points?: unknown };
    const label = String(record.label || record.name || "").trim();
    if (!label) return [];
    const pixels = asPixels(record.points);
    return pixels.length >= 3 ? [{ label, pixels }] : [];
  });
}

function asPixels(value: unknown): [number, number][] {
  if (!Array.isArray(value)) return [];
  const points: [number, number][] = [];
  for (const point of value) {
    if (Array.isArray(point) && point.length >= 2 && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))) {
      points.push([Number(point[0]), Number(point[1])]);
      continue;
    }
    if (point && typeof point === "object") {
      const record = point as { x?: unknown; y?: unknown };
      if (Number.isFinite(Number(record.x)) && Number.isFinite(Number(record.y))) {
        points.push([Number(record.x), Number(record.y)]);
      }
    }
  }
  return points;
}
