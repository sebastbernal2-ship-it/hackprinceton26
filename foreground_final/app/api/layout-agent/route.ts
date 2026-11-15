import { NextResponse } from "next/server";
import { loadSite } from "@/lib/sites/load";
import { decideLayout, type WallBrief } from "../../lib/layout-gemini";
import type { PlacedFootprint, RoomMeasure } from "../../lib/layout-fit";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    message?: string;
    mode?: "matterport" | "foreground";
    rooms?: RoomMeasure[];
    placed?: PlacedFootprint[];
    total?: number;
    walls?: WallBrief[];
    siteId?: string;
  } | null;
  const message = body?.message?.trim() || "";
  if (!message) return NextResponse.json({ error: "Say what should change." }, { status: 400 });
  // the property's own facts, so sizes are checked against the real structure
  const site = typeof body?.siteId === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(body.siteId) ? loadSite(body.siteId) : null;
  const heights = (site?.matterport?.rooms ?? []).map((room) => room.heightFt).filter((h): h is number => typeof h === "number" && h > 6);
  const ceilingM = heights.length ? (Math.min(...heights) * 0.3048) : undefined;
  const facts = site
    ? [
        `CoStar: suite ${site.space.suite ?? "n/a"}, ${Math.round(site.space.sf)} sq ft available (${(site.space.sf / 10.764).toFixed(0)} m²) in a ${Math.round(site.buildingSf ?? 0)} sq ft ${site.propertyType}; notes: ${site.space.notes || "none"}.`,
        site.matterport
          ? `Matterport scan rooms: ${site.matterport.rooms
              .slice(0, 12)
              .map((room) => `${room.label} ${room.areaSf ? `${Math.round(room.areaSf)} sq ft` : ""}${room.widthFt && room.depthFt ? ` (${room.widthFt.toFixed(0)}×${room.depthFt.toFixed(0)} ft)` : ""}${room.heightFt ? `, ceiling ${room.heightFt.toFixed(1)} ft` : ""}`)
              .join("; ")}.`
          : "",
        site.aerial
          ? `Vexcel aerial: building footprint ${site.aerial.footprintSf ? `${Math.round(site.aerial.footprintSf)} sq ft` : "unknown"}, patio candidate ${site.aerial.patioCandidateSf ? `${Math.round(site.aerial.patioCandidateSf)} sq ft outside` : "none"}, ${site.aerial.parkingSpaces ?? "unknown"} parking spaces.`
          : "",
        `Inspection findings: ${site.findings.map((f) => `${f.kind} ${f.status}`).join(", ")}.`,
        ceilingM ? `Lowest ceiling: ${ceilingM.toFixed(2)} m.` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : undefined;
  try {
    const decision = await decideLayout({
      facts,
      ceilingM,
      message,
      mode: body?.mode === "foreground" ? "foreground" : "matterport",
      rooms: Array.isArray(body?.rooms)
        ? body.rooms.slice(0, 40).map((room) => ({
            id: String(room.id),
            label: String(room.label).slice(0, 120),
            width: Number(room.width) || 0,
            depth: Number(room.depth) || 0,
            area: Number(room.area) || 0,
            freeArea: room.freeArea === undefined ? undefined : Number(room.freeArea) || 0,
            note: typeof room.note === "string" ? room.note.slice(0, 120) : undefined,
          }))
        : [],
      placed: Array.isArray(body?.placed) ? body.placed : [],
      total: Number(body?.total) || 0,
      walls: Array.isArray(body?.walls)
        ? body.walls
            .slice(0, 200)
            .map((w) => ({ number: Number(w.number), length: Number(w.length) || 0, role: String(w.role), between: String(w.between).slice(0, 80), removed: Boolean(w.removed) }))
            .filter((w) => Number.isFinite(w.number))
        : [],
    });
    return NextResponse.json(decision);
  } catch (error) {
    const reply = error instanceof Error ? error.message : "The layout agent is unavailable.";
    return NextResponse.json({ error: reply }, { status: 502 });
  }
}
