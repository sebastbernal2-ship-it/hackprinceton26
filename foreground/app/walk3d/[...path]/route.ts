import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

// Serves Davd's first-person walk viewer (modeling/walk.html) from the Next app, so it needs no second server.
// Reserved for the planning steps (4+): rearranging and placing furniture in the scan. The Inspect step's
// "Open 3D Tour" button uses the plain Matterport Showcase tour instead (components/tour-overlay.tsx).
//   /walk3d/walk.html?model=<id>        the viewer
//   /walk3d/vendor/*                    vendored three.js
//   /walk3d/showcase/config.js          empty config (the viewer takes ?model=)
//   /walk3d/files/<assets_x|pano_x>/... local scan exports; next.config rewrites /assets_* and /pano_* here
//   /walk3d/available?model=<id>        {"walk": true} when assets_<id>/walk/meta.json exists
// The scan exports are sponsor-derived, local and uncommitted. Nothing here writes or reaches the network.
const ROOT = process.env.SCAN_ASSETS_DIR || path.resolve(process.cwd(), "..");
// The viewer and vendored three.js come from this repo; the scan exports (SCAN_ASSETS_DIR) may live anywhere else.
const MODELING = process.env.MODELING_DIR || path.resolve(process.cwd(), "..", "modeling");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".bin": "application/octet-stream",
  ".gltf": "model/gltf+json", ".glb": "model/gltf-binary", ".ktx2": "image/ktx2",
};

const SAFE_PART = /^[A-Za-z0-9._-]+$/;

async function send(file: string, cache = "no-store") {
  try {
    const info = await stat(file);
    if (!info.isFile()) return new NextResponse("Not found", { status: 404 });
    const bytes = await readFile(file);
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream", "Cache-Control": cache },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const parts = (await params).path;
  if (!parts.every((p) => SAFE_PART.test(p) && p !== "." && p !== "..")) return new NextResponse("Bad path", { status: 400 });
  const [head, ...rest] = parts;

  if (head === "walk.html" && rest.length === 0) return send(path.join(MODELING, "walk.html"));
  if ((head === "fio_commands.js" || head === "fio_design.js" || head === "floor_reset.js") && rest.length === 0) return send(path.join(MODELING, head));
  if (head === "vendor" && rest.length === 1) return send(path.join(MODELING, "vendor", rest[0]), "public, max-age=86400");
  if (head === "showcase" && rest[0] === "config.js") {
    return new NextResponse("window.HP_CONFIG = window.HP_CONFIG || {};\n", { headers: { "Content-Type": "text/javascript" } });
  }
  if (head === "available") {
    const model = new URL(request.url).searchParams.get("model") || "";
    if (!/^[A-Za-z0-9]{11}$/.test(model)) return NextResponse.json({ walk: false });
    const ok = await stat(path.join(ROOT, `assets_${model}`, "walk", "meta.json")).then((s) => s.isFile(), () => false);
    return NextResponse.json({ walk: ok });
  }
  if (head === "files" && rest.length >= 2 && /^(assets_[A-Za-z0-9]{11}|assets_catalog|pano_[A-Za-z0-9]{11})$/.test(rest[0])) {
    // the walk pack (meta.json, mesh.bin) and piece lists change whenever a model is rebuilt: never cache them
    const cache = rest.some((p) => p === "walk" || p === "mesh_diff") ? "no-store" : "private, max-age=3600";
    return send(path.join(ROOT, ...rest), cache);
  }
  return new NextResponse("Not found", { status: 404 });
}
