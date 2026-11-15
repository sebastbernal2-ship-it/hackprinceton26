import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { rateLimited } from "../../lib/guard";
import { previewImageUrl } from "../../lib/matterport-scan";

// Images for a Matterport model, for listing cards and the Inspect gallery.
//   n=0  preview image: local download (assets_<id>/matterport/preview.jpg) if present, else Matterport's own preview
//   n>0  the n-th photo from a local download (assets_<id>/matterport/photos/), else 404
// Local downloads come from modeling/download_assets.py; they are sponsor data and stay uncommitted.
const ROOT = process.env.SCAN_ASSETS_DIR || path.resolve(process.cwd(), "..");
const remote = new Map<string, Promise<{ bytes: Uint8Array; type: string } | null>>();

function image(bytes: Uint8Array, type: string) {
  return new NextResponse(bytes as BodyInit, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600" } });
}

async function fetchPreview(modelId: string) {
  try {
    const url = await previewImageUrl(modelId);
    if (!url) return null;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return { bytes: new Uint8Array(await response.arrayBuffer()), type: response.headers.get("content-type") || "image/jpeg" };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const modelId = url.searchParams.get("modelId") || "";
  const n = Number(url.searchParams.get("n") || "0");
  if (!/^[A-Za-z0-9]{11}$/.test(modelId) || !Number.isInteger(n) || n < 0 || n > 50) {
    return NextResponse.json({ error: "Unknown image." }, { status: 400 });
  }
  const dir = path.join(ROOT, `assets_${modelId}`, "matterport");
  try {
    let file = path.join(dir, "preview.jpg");
    if (n > 0) {
      const photos = (await readdir(path.join(dir, "photos"))).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
      if (n > photos.length) return new NextResponse("No such photo", { status: 404 });
      file = path.join(dir, "photos", photos[n - 1]);
    }
    return image(new Uint8Array(await readFile(file)), file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg");
  } catch {
    if (n > 0) return new NextResponse("Not downloaded", { status: 404 });
  }
  if (!remote.has(modelId)) {
    if (rateLimited("scan-photo", request, 60)) return new NextResponse("Too many requests", { status: 429 });
    remote.set(modelId, fetchPreview(modelId));
  }
  const hit = await remote.get(modelId)!;
  if (!hit) {
    remote.delete(modelId);
    return new NextResponse("No preview", { status: 404 });
  }
  return image(hit.bytes, hit.type);
}
