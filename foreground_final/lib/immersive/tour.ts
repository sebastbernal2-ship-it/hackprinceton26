/**
 * The guided tour of a scanned space: which panos to stop at, in what order, and what to say at each.
 * Pure. Every number and claim comes from the site's findings and the engine's cost lines, never from model text.
 */

import { roomAt, walkable, type WalkPano } from "./walk";

export type TourTone = "needed" | "saved" | "maybe" | "info";

export type TourFinding = {
  id: string;
  kind: string;
  status: "present" | "absent" | "unknown";
  confidence: number;
  evidence: string;
  source: string;
  position?: { x: number; y: number; z: number };
  panoId?: string;
};

export type TourLine = {
  kind: string;
  status: "needed" | "saved" | "maybe";
  label: string;
  range: { low: number; high: number };
  findingId?: string;
};

export type TourStop = {
  index: number;
  panoId: string;
  title: string;
  text: string;
  source: string;
  /** a point in scan metres to face on arrival: the finding's anchor, else the most open direction from the pano */
  look?: { x: number; y: number; z: number };
  pin?: { tone: TourTone; label: string; amountUsd?: { low: number; high: number } };
};

type RoomLike = { label: string; polygon?: [number, number][] };

export const MAX_STOPS = 5;

const SOURCE_LABEL: Record<string, string> = {
  "matterport-vision": "Matterport scan, vision read",
  "matterport-rooms": "Matterport room layout",
  "costar-notes": "CoStar listing notes",
  "costar-tenants": "CoStar tenant history",
  vexcel: "Vexcel aerial",
};

const KIND_TITLE: Record<string, string> = {
  hood: "Kitchen hood",
  "grease-trap": "Grease trap",
  "kitchen-line": "Kitchen line",
  "walk-in": "Walk-in cooler",
  restrooms: "Restrooms",
  electrical: "Electrical",
  gas: "Gas",
  sewer: "Sewer",
  ada: "ADA access",
  "prior-use": "Past use",
  patio: "Patio",
  storefront: "Storefront",
};

const M2_TO_SF = 10.7639;

function polygonArea(poly: [number, number][]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return Math.abs(a) / 2;
}

/** what the scan itself says about a room: its label, its floor area from the outline, the scan positions in it */
function describeRoom(rooms: RoomLike[], label: string, panos: WalkPano[]): string {
  const room = rooms.find((r) => r.label === label && r.polygon && r.polygon.length >= 3);
  const sf = room?.polygon ? Math.round((polygonArea(room.polygon) * M2_TO_SF) / 10) * 10 : 0;
  const here = panos.filter((p) => roomAt(rooms, p.position) === label).length;
  const parts = [`The scan outlines the ${label.toLowerCase()}`];
  if (sf >= 20 && sf <= 50_000) parts[0] += ` at about ${sf.toLocaleString("en-US")} SF`;
  parts[0] += ".";
  if (here > 0) parts.push(`${here === 1 ? "One scan position stands" : `${here} scan positions stand`} in it.`);
  parts.push("No cost line points at it, so this stop is for getting your bearings.");
  return parts.join(" ");
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** the walkable pano a finding belongs to: its own panoId, else the nearest one to its anchor */
function panoFor(f: TourFinding, panos: WalkPano[]): WalkPano | null {
  const own = f.panoId ? panos.find((p) => p.id === f.panoId) : undefined;
  if (own) return own;
  const at = f.position;
  if (!at) return null;
  let best: WalkPano | null = null;
  let bestD = Infinity;
  for (const p of panos) {
    const d = dist(p.position, at) + 2 * Math.abs(p.position.z - at.z);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function lineFor(f: TourFinding, lines: TourLine[]): TourLine | undefined {
  return lines.find((l) => l.findingId === f.id) ?? lines.find((l) => l.kind === f.kind);
}

/** what matters most first: money the owner pays, then unknowns, then savings, then findings with no line */
function weight(f: TourFinding, line: TourLine | undefined): number {
  if (!line) return 0;
  const base = line.status === "needed" ? 3e6 : line.status === "maybe" ? 2e6 : 1e6;
  return base + line.range.high;
}

function nearestOrder(items: { pano: WalkPano }[], start: WalkPano): typeof items {
  const left = [...items];
  const out: typeof items = [];
  let at = start;
  while (left.length) {
    let bi = 0;
    for (let i = 1; i < left.length; i++) if (dist(left[i].pano.position, at.position) < dist(left[bi].pano.position, at.position)) bi = i;
    const [next] = left.splice(bi, 1);
    out.push(next);
    at = next.pano;
  }
  return out;
}

/** the most open way to face from a pano: toward the middle of its room if it is outlined, else toward the farthest other scan position */
export function openLook(pano: WalkPano, panos: WalkPano[], rooms: RoomLike[]): { x: number; y: number; z: number } | undefined {
  const label = roomAt(rooms, pano.position);
  const poly = label ? rooms.find((r) => r.label === label && r.polygon && r.polygon.length >= 3)?.polygon : undefined;
  if (poly) {
    const cx = poly.reduce((t, q) => t + q[0], 0) / poly.length;
    const cy = poly.reduce((t, q) => t + q[1], 0) / poly.length;
    if (Math.hypot(cx - pano.position.x, cy - pano.position.y) >= 1.5) return { x: cx, y: cy, z: pano.position.z };
  }
  let far: WalkPano | null = null;
  let farD = 0;
  for (const p of panos) {
    const d = dist(p.position, pano.position);
    if (p.id !== pano.id && d > farD) {
      farD = d;
      far = p;
    }
  }
  return far ? { x: far.position.x, y: far.position.y, z: pano.position.z } : undefined;
}

export function buildTour(input: { panos: WalkPano[]; rooms: RoomLike[]; findings: TourFinding[]; lines: TourLine[]; max?: number }): TourStop[] {
  const panos = walkable(input.panos);
  if (!panos.length) return [];
  const max = Math.max(1, input.max ?? MAX_STOPS);

  // best finding per pano
  const byPano = new Map<string, { pano: WalkPano; finding: TourFinding; line?: TourLine; w: number }>();
  for (const finding of input.findings) {
    const pano = panoFor(finding, panos);
    if (!pano) continue;
    const line = lineFor(finding, input.lines);
    const w = weight(finding, line);
    const cur = byPano.get(pano.id);
    if (!cur || w > cur.w) byPano.set(pano.id, { pano, finding, line, w });
  }
  const chosen = [...byPano.values()].sort((a, b) => b.w - a.w).slice(0, max);

  type Pick = { pano: WalkPano; finding?: TourFinding; line?: TourLine };
  let picks: Pick[] = nearestOrder(chosen, panos[0]);

  // thin findings: pad with spread-out overview stops so the walk still covers the space
  const minStops = Math.min(3, panos.length, max);
  while (picks.length < minStops) {
    const used = new Set(picks.map((p) => p.pano.id));
    let far: WalkPano | null = null;
    let farD = -1;
    for (const p of panos) {
      // a padded stop must have something true to say: only panos inside an outlined room qualify
      if (used.has(p.id) || !roomAt(input.rooms, p.position)) continue;
      const d = Math.min(...(picks.length ? picks.map((q) => dist(q.pano.position, p.position)) : [0]));
      if (d > farD) {
        farD = d;
        far = p;
      }
    }
    if (!far) break;
    picks = [...picks, { pano: far }];
  }
  if (!picks.length) picks = [{ pano: panos[0] }];

  return picks.map((pk, index): TourStop => {
    const room = roomAt(input.rooms, pk.pano.position) ?? pk.pano.label ?? null;
    const f = pk.finding;
    if (!f) {
      return {
        index,
        panoId: pk.pano.id,
        title: room ?? "Another angle",
        text: roomAt(input.rooms, pk.pano.position)
          ? describeRoom(input.rooms, roomAt(input.rooms, pk.pano.position) as string, panos)
          : room
            ? `This scan position is labelled "${room}". No cost line points at it.`
            : "A scan position with no outlined room and no cost line.",
        source: "Matterport room layout",
        look: openLook(pk.pano, panos, input.rooms),
      };
    }
    const line = pk.line;
    const title = line?.label ?? KIND_TITLE[f.kind] ?? f.kind;
    const src = SOURCE_LABEL[f.source] ?? f.source;
    // the cost line can rest on another source (e.g. the listing) than what this scan shows: say so, never "already here" over "absent"
    const conflict = line && line.findingId !== f.id && ((line.status === "saved" && f.status === "absent") || (line.status === "needed" && f.status === "present"));
    if (line && conflict) {
      const listingSays = line.status === "saved" ? "the listing says it's there" : "the listing says it's missing";
      return {
        index,
        panoId: pk.pano.id,
        title,
        text: `${f.evidence} The scan and the listing disagree here: ${listingSays}. Ask the landlord before you count on it.`,
        source: `${src}, ${Math.round(f.confidence * 100)}% confidence`,
        look: f.position,
        pin: { tone: "maybe", label: `${title}: ask the landlord`, amountUsd: { low: line.range.low, high: line.range.high } },
      };
    }
    const pin: TourStop["pin"] = line
      ? {
          tone: line.status,
          label: line.status === "maybe" ? `${title}: ask the landlord` : line.status === "saved" ? `${title}: already here` : `${title}: you pay`,
          amountUsd: { low: line.range.low, high: line.range.high },
        }
      : { tone: "info", label: title };
    return { index, panoId: pk.pano.id, title, text: f.evidence, source: `${src}, ${Math.round(f.confidence * 100)}% confidence`, look: f.position, pin };
  });
}
