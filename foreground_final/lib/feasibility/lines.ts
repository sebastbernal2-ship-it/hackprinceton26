import raw from "@/data/benchmarks.json";
import type { Range } from "@/lib/engine/types";
import type { Site } from "@/lib/sites/schema";
import type { Change, ChangeLine, SourceRef } from "./types";

export const F = raw.feasibility;
const C = F.changeCosts;

export const rng = (low: number, high: number): Range => ({ low, mid: (low + high) / 2, high });
export const ZERO: Range = { low: 0, mid: 0, high: 0 };
export const addR = (a: Range, b: Range): Range => ({ low: a.low + b.low, mid: a.mid + b.mid, high: a.high + b.high });
export const text = (c: Change) => `${c.target} ${c.detail}`.toLowerCase();
export const n0 = (n: number) => Math.round(n).toLocaleString("en-US");

type Room = NonNullable<Site["matterport"]>["rooms"][number];

/** The scanned room a change names ("Main Dining Room"), else the largest room. */
export function roomFor(site: Site, change: Change): Room | null {
  const rooms = (site.matterport?.rooms ?? []).filter((r) => r.areaSf);
  if (rooms.length === 0) return null;
  const t = text(change);
  // "Main Dining Room" is matched by "dining"; unlabeled rooms are never matched by name
  const named = rooms.find((r) => {
    const key = r.label.toLowerCase().replace(/^main /, "").replace(/ room$/, "");
    return !key.startsWith("unlabeled") && t.includes(key);
  });
  return named ?? rooms.reduce((a, b) => ((b.areaSf ?? 0) > (a.areaSf ?? 0) ? b : a));
}

/** Floor area a change covers: stated, else the named room, else 60% of the listing. */
export function floorSf(site: Site, change: Change): { sf: number; basis: string } {
  if (change.quantities.areaSf) return { sf: change.quantities.areaSf, basis: `${n0(change.quantities.areaSf)} SF` };
  const room = roomFor(site, change);
  if (room?.areaSf) return { sf: room.areaSf, basis: `${n0(room.areaSf)} SF (${room.label}, from the scan)` };
  const sf = site.space.sf * raw.diningAreaShare.value;
  return { sf, basis: `${n0(sf)} SF (60% of the listing area)` };
}

type Unit = { low: number; high: number; source: SourceRef };
const per = (unit: Unit, qty: number): Range => rng(unit.low * qty, unit.high * qty);
const dollars = (u: Unit) => `$${n0(u.low)}-${n0(u.high)}`;

/**
 * What the change itself costs to build, before any code consequence (those are the checks).
 *   finish      brick, other wall finish, concrete or other floor, by area
 *   ceiling     new ceiling by area
 *   storefront  per linear foot (24 ft when no length is given), plus a sign when asked
 *   exterior    patio allowance
 *   equipment   per piece
 *   wall, use, layout: no line price. The wall check, the engine and the plan price those.
 */
export function changeLine(change: Change, site: Site): ChangeLine {
  const t = text(change);
  const q = change.quantities;
  const none = (basis: string): ChangeLine => ({ changeId: change.id, range: null, basis, source: C.allowance.source });
  const line = (range: Range, basis: string, source: SourceRef): ChangeLine => ({ changeId: change.id, range, basis, source });

  switch (change.kind) {
    case "wall":
      return none("Priced in the wall-removal check below.");
    case "use":
      return none("A new concept re-prices the whole build-out; see the numbers.");
    case "layout": {
      if (/\bbar\b/.test(t) && q.lengthFt) return none(`${n0(q.lengthFt)} ft of bar, priced with the plan.`);
      return none("Furniture and millwork are priced with the plan.");
    }
    case "ceiling": {
      const { sf, basis } = floorSf(site, change);
      return line(per(C.ceilingPerSf, sf), `${basis} of new ceiling at ${dollars(C.ceilingPerSf)}/SF.`, C.ceilingPerSf.source);
    }
    case "finish": {
      const floor = /floor|concrete|tile|terrazzo|lvt|hardwood/.test(t);
      const wall = /wall|brick|paint|plaster|panel|wainscot|slat|mural/.test(t) || !floor;
      const { sf, basis } = floorSf(site, change);
      // walls of a room: perimeter of a square of that area times a 10 ft wall, unless an area was given
      const wallSf = q.areaSf ?? 4 * Math.sqrt(sf) * C.defaultWallHeightFt.value;
      const wallBasis = q.areaSf ? `${n0(wallSf)} SF of wall` : `about ${n0(wallSf)} SF of wall (room perimeter x ${C.defaultWallHeightFt.value} ft)`;
      const parts: { range: Range; basis: string }[] = [];
      if (wall) {
        const unit = /brick/.test(t) ? C.brickVeneerPerSf : C.wallFinishPerSf;
        parts.push({ range: per(unit, wallSf), basis: `${wallBasis} at ${dollars(unit)}/SF` });
      }
      if (floor) {
        const unit = /concrete/.test(t) ? C.concreteFloorPerSf : C.floorFinishPerSf;
        parts.push({ range: per(unit, sf), basis: `${basis} of floor at ${dollars(unit)}/SF` });
      }
      return line(parts.map((p) => p.range).reduce(addR, ZERO), `${parts.map((p) => p.basis).join("; ")}.`, C.wallFinishPerSf.source);
    }
    case "storefront": {
      const ft = q.lengthFt ?? C.defaultStorefrontFt.value;
      let range = per(C.storefrontPerFt, ft);
      let basis = `${n0(ft)} ft of glass storefront${q.lengthFt ? "" : " (assumed width)"} at ${dollars(C.storefrontPerFt)}/ft`;
      if (/sign/.test(t) || change.involves.includes("signage")) {
        range = addR(range, rng(C.signage.low, C.signage.high));
        basis += `, plus a sign at ${dollars(C.signage)}`;
      }
      return line(range, `${basis}.`, C.storefrontPerFt.source);
    }
    case "exterior": {
      if (/sign/.test(t) && !/patio|seat|deck/.test(t)) return line(rng(C.signage.low, C.signage.high), `Illuminated sign at ${dollars(C.signage)}.`, C.signage.source);
      if (/patio|seat|deck|outdoor|sidewalk/.test(t) || change.involves.includes("patio"))
        return line(rng(C.patio.low, C.patio.high), `Patio set-up at ${dollars(C.patio)}: barriers, paving repair, furniture, lighting.`, C.patio.source);
      return line(rng(C.allowance.low, C.allowance.high), `Allowance of ${dollars(C.allowance)} until the exterior work is drawn.`, C.allowance.source);
    }
    case "equipment": {
      if (/\bhood\b/.test(t) && !q.count) return none("Priced in the hood check below.");
      const count = Math.max(1, Math.round(q.count ?? 1));
      return line(per(C.equipmentEach, count), `${count} piece${count === 1 ? "" : "s"} of equipment at ${dollars(C.equipmentEach)} each, connected.`, C.equipmentEach.source);
    }
  }
}
