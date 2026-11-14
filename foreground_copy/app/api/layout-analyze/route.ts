import { NextResponse } from "next/server";
import { layoutFromPlan, type FloorLayout } from "../../lib/floor-layout";
import { traceFloorplan } from "../../lib/gemini-rooms";
import { loadScan } from "../../lib/matterport-scan";

const plans = new Map<string, FloorLayout>();

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { modelId?: string; squareFeet?: number } | null;
  const modelId = body?.modelId || "";
  const squareFeet = Number(body?.squareFeet) || 0;
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(modelId)) {
    return NextResponse.json({ error: "Unknown model." }, { status: 400 });
  }

  const cacheKey = `${modelId}:photo2:${Math.round(squareFeet)}`;
  const cached = plans.get(cacheKey);
  if (cached) return NextResponse.json({ layout: cached });

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
    return NextResponse.json({ layout });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read the floorplan.";
    return NextResponse.json({ error: message, layout: null }, { status: 502 });
  }
}
