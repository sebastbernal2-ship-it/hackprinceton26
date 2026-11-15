/** Tiny plat geometry: project a city's sites into a square panel and survey them. */

export type MapSite = {
  id: string;
  address: string;
  suite: string | null;
  city: "Houston" | "Los Angeles";
  lat: number;
  lng: number;
  sf: number;
  rentPerSfYr: number | null;
};

export type Placed = MapSite & { x: number; y: number };

export type Panel = {
  city: MapSite["city"];
  w: number;
  h: number;
  sites: Placed[];
  /** graticule lines in panel units with their degree labels */
  meridians: { x: number; label: string }[];
  parallels: { y: number; label: string }[];
  /** traverse legs between monuments (a minimum spanning tree) */
  legs: { a: Placed; b: Placed; label: string }[];
  center: { lat: number; lng: number };
};

const KM_PER_DEG = 111.32;

export function projectCity(city: MapSite["city"], sites: MapSite[], w = 420, h = 600): Panel {
  const size = Math.min(w, h);
  const s = sites.filter((x) => x.city === city);
  const lat0 = s.reduce((a, b) => a + b.lat, 0) / Math.max(1, s.length);
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = s.map((p) => p.lng * k);
  const ys = s.map((p) => p.lat);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 0.02);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const scale = (size * 0.74) / span;
  const px = (lng: number) => w / 2 + (lng * k - cx) * scale;
  const py = (lat: number) => h / 2 - (lat - cy) * scale;

  const placed: Placed[] = relax(
    s.map((p) => ({ ...p, x: px(p.lng), y: py(p.lat) })),
    w,
    h,
  );

  // graticule at a round step
  const degSpan = size / scale;
  const step = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5].find((st) => degSpan / st <= 9) ?? 1;
  const lngMin = (cx - w / 2 / scale) / k;
  const lngMax = (cx + w / 2 / scale) / k;
  const latMin = cy - h / 2 / scale;
  const latMax = cy + h / 2 / scale;
  const meridians: Panel["meridians"] = [];
  for (let g = Math.ceil(lngMin / step) * step; g <= lngMax; g += step) {
    meridians.push({ x: px(g), label: `${Math.abs(g).toFixed(2)}°W` });
  }
  const parallels: Panel["parallels"] = [];
  for (let g = Math.ceil(latMin / step) * step; g <= latMax; g += step) {
    parallels.push({ y: py(g), label: `${g.toFixed(2)}°N` });
  }

  // Prim's MST over monuments, labelled with bearing and distance like a traverse
  const legs: Panel["legs"] = [];
  if (placed.length > 1) {
    const inTree = new Set([0]);
    while (inTree.size < placed.length) {
      let best: [number, number, number] | null = null;
      for (const i of inTree) {
        for (let j = 0; j < placed.length; j++) {
          if (inTree.has(j)) continue;
          const d = Math.hypot(placed[i].x - placed[j].x, placed[i].y - placed[j].y);
          if (!best || d < best[2]) best = [i, j, d];
        }
      }
      if (!best) break;
      inTree.add(best[1]);
      const a = placed[best[0]];
      const b = placed[best[1]];
      legs.push({ a, b, label: traverseLabel(a, b, k) });
    }
  }

  return { city, w, h, sites: placed, meridians, parallels, legs, center: { lat: lat0, lng: cx / k } };
}

/**
 * Schematic placement: sites closer than a label's height are pushed apart (like a transit diagram),
 * so every monument and its address stay legible. Bearings and distances are still computed from true coordinates.
 */
function relax(pts: Placed[], w: number, h: number): Placed[] {
  const out = pts.map((p) => ({ ...p }));
  const minD = Math.min(w, h) * 0.24;
  const pad = Math.min(w, h) * 0.1;
  for (let it = 0; it < 200; it++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        let dx = out[j].x - out[i].x;
        let dy = out[j].y - out[i].y;
        let d = Math.hypot(dx, dy);
        if (d >= minD) continue;
        if (d < 0.001) {
          dx = 0;
          dy = 1;
          d = 1;
        }
        const push = (minD - d) / 2;
        out[i].x -= (dx / d) * push;
        out[i].y -= (dy / d) * push;
        out[j].x += (dx / d) * push;
        out[j].y += (dy / d) * push;
        moved = true;
      }
    }
    for (const p of out) {
      p.x = Math.max(pad, Math.min(w - pad, p.x));
      p.y = Math.max(pad, Math.min(h - pad, p.y));
    }
    if (!moved) break;
  }
  // round so server and client render identical attributes
  return out.map((p) => ({ ...p, x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 }));
}

function traverseLabel(a: MapSite, b: MapSite, k: number): string {
  const dn = (b.lat - a.lat) * KM_PER_DEG;
  const de = (b.lng - a.lng) * KM_PER_DEG * k;
  const km = Math.hypot(dn, de);
  const deg = Math.round((Math.atan2(Math.abs(de), Math.abs(dn)) * 180) / Math.PI);
  return `${dn >= 0 ? "N" : "S"} ${deg}° ${de >= 0 ? "E" : "W"} · ${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/** What the owner has typed so far, read loosely enough to react while they type. */
export type Draft = { city?: MapSite["city"]; seats?: number; budget?: number };

export function readDraft(text: string): Draft {
  const t = text.toLowerCase();
  const draft: Draft = {};
  if (/\bhouston\b|\bhtx\b/.test(t)) draft.city = "Houston";
  else if (/\blos angeles\b|\bl\.?a\.?\b|\bla\b/.test(t)) draft.city = "Los Angeles";
  const seats = /(\d{1,3})\s*(?:-\s*)?(?:seats?|covers|chairs)/.exec(t);
  if (seats) draft.seats = Number(seats[1]);
  const money = /\$\s*(\d+(?:\.\d+)?)\s*(k|m)?\b/.exec(t) ?? /(\d+(?:\.\d+)?)\s*(k|m)\b/.exec(t);
  if (money) draft.budget = Number(money[1]) * (money[2] === "m" ? 1e6 : money[2] === "k" ? 1e3 : 1);
  return draft;
}

/** A space "fits" a draft when the city matches and it can hold the seats (about 20 SF a seat overall). */
export function fits(site: MapSite, d: Draft): boolean {
  if (d.city && site.city !== d.city) return false;
  if (d.seats && site.sf < d.seats * 20) return false;
  return true;
}
