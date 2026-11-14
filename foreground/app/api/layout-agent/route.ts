import { NextResponse } from "next/server";
import { failureStatus } from "../../lib/server-env";
import { decideLayout } from "../../lib/layout-gemini";
import type { PlacedFootprint, RoomMeasure } from "../../lib/layout-fit";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    message?: string;
    mode?: "matterport" | "foreground";
    rooms?: RoomMeasure[];
    placed?: PlacedFootprint[];
    total?: number;
  } | null;
  const message = body?.message?.trim() || "";
  if (!message) return NextResponse.json({ error: "Say what should change." }, { status: 400 });
  try {
    const decision = await decideLayout({
      message,
      mode: body?.mode === "foreground" ? "foreground" : "matterport",
      rooms: Array.isArray(body?.rooms) ? body.rooms : [],
      placed: Array.isArray(body?.placed) ? body.placed : [],
      total: Number(body?.total) || 0,
    });
    return NextResponse.json(decision);
  } catch (error) {
    const reply = error instanceof Error ? error.message : "The layout agent is unavailable.";
    return NextResponse.json({ error: reply }, { status: failureStatus(error) });
  }
}
