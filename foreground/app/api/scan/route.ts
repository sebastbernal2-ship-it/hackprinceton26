import { NextResponse } from "next/server";
import { failureStatus } from "../../lib/server-env";
import { loadScan } from "../../lib/matterport-scan";
import { rateLimited } from "../../lib/guard";

export async function GET(request: Request) {
  if (rateLimited("scan", request, 40)) return NextResponse.json({ error: "Too many requests; try again in a minute." }, { status: 429 });
  const url = new URL(request.url);
  const modelId = url.searchParams.get("modelId") || "";
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(modelId)) {
    return NextResponse.json({ error: "Unknown model." }, { status: 400 });
  }

  try {
    const scan = await loadScan(modelId);
    const asset = url.searchParams.get("asset");
    if (asset === "floorplan") {
      if (!scan.floorplan) return new NextResponse("No floorplan", { status: 404 });
      return new NextResponse(new Uint8Array(scan.floorplan.bytes), {
        headers: {
          "content-type": scan.floorplan.contentType,
          "cache-control": "private, max-age=3600",
        },
      });
    }
    if (asset === "mesh") {
      if (!scan.mesh) return new NextResponse("No mesh", { status: 404 });
      return new NextResponse(new Uint8Array(scan.mesh.bytes), {
        headers: {
          "content-type": scan.mesh.contentType,
          "cache-control": "private, max-age=3600",
        },
      });
    }
    return NextResponse.json({
      modelId,
      floorplan: scan.floorplan
        ? {
            href: `/api/scan?modelId=${modelId}&asset=floorplan`,
            originX: scan.floorplan.originX,
            originY: scan.floorplan.originY,
            width: scan.floorplan.width,
            height: scan.floorplan.height,
            resolution: scan.floorplan.resolution,
            flags: scan.floorplan.flags,
            floor: scan.floorplan.floorLabel,
          }
        : null,
      mesh: scan.mesh
        ? { filename: scan.mesh.filename, format: scan.mesh.format, bytes: scan.mesh.bytes.length }
        : null,
      note: scan.note,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read the scan.";
    return NextResponse.json({ error: message }, { status: failureStatus(error) });
  }
}
