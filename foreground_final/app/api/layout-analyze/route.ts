import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { layoutFromPlan, type FloorLayout } from "../../lib/floor-layout";
import { traceFloorplan } from "../../lib/gemini-rooms";
import { loadScan } from "../../lib/matterport-scan";

const plans = new Map<string, FloorLayout>();
/** one Gemini trace per model at a time: the Discover prewarm and an opened tour share it */
const inflight = new Map<string, Promise<Response>>();
/** traced plans survive restarts: Gemini tracing takes a minute or two, a cached plan loads at once */
const CACHE_DIR = path.join(process.cwd(), "data", "cache", "layouts");

async function readCached(key: string): Promise<FloorLayout | null> {
  try {
    return JSON.parse(await readFile(path.join(CACHE_DIR, `${key.replace(/[^A-Za-z0-9_-]/g, "_")}.json`), "utf8")) as FloorLayout;
  } catch {
    return null;
  }
}

async function writeCached(key: string, layout: FloorLayout) {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(path.join(CACHE_DIR, `${key.replace(/[^A-Za-z0-9_-]/g, "_")}.json`), JSON.stringify(layout));
  } catch {
    // the memory cache still holds it
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { modelId?: string; squareFeet?: number } | null;
  const modelId = body?.modelId || "";
  const squareFeet = Number(body?.squareFeet) || 0;
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(modelId)) {
    return NextResponse.json({ error: "Unknown model." }, { status: 400 });
  }

  const cacheKey = `${modelId}:photo2:${Math.round(squareFeet)}`;
  const cached = plans.get(cacheKey) ?? (await readCached(cacheKey));
  if (cached) {
    plans.set(cacheKey, cached);
    return NextResponse.json({ layout: cached });
  }
  const running = inflight.get(cacheKey);
  if (running) return (await running).clone();
  const job = analyze(modelId, squareFeet, cacheKey);
  inflight.set(cacheKey, job);
  try {
    return (await job).clone();
  } finally {
    inflight.delete(cacheKey);
  }
}

async function analyze(modelId: string, squareFeet: number, cacheKey: string): Promise<Response> {
  try {
    const scan = await loadScan(modelId);
    if (!scan.floorplan) {
      return NextResponse.json({ error: scan.note, layout: null }, { status: 404 });
    }
    const rooms = await traceFloorplan(modelId, scan.floorplan.bytes, scan.floorplan.contentType, {
      width: scan.floorplan.width,
      height: scan.floorplan.height,
    });
    const mesh = scan.mesh && scan.mesh.format !== "cloud" ? scan.mesh : null;
    const layout = layoutFromPlan({
      modelId,
      squareFeet,
      rooms,
      image: {
        href: `/api/scan?modelId=${modelId}&asset=floorplan`,
        originX: scan.floorplan.originX,
        originY: scan.floorplan.originY,
        width: scan.floorplan.width,
        height: scan.floorplan.height,
        resolution: scan.floorplan.resolution,
      },
      meshHref: mesh ? `/api/scan?modelId=${modelId}&asset=mesh` : undefined,
      meshFormat: mesh?.format,
    });
    if (layout.source !== "plan") {
      return NextResponse.json({ error: "The floorplan did not produce room polygons.", layout: null }, { status: 422 });
    }
    plans.set(cacheKey, layout);
    await writeCached(cacheKey, layout);
    return NextResponse.json({ layout });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read the floorplan.";
    return NextResponse.json({ error: message, layout: null }, { status: 502 });
  }
}
