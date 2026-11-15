import type { Range } from "@/lib/engine/types";
import type { ImagineVersion, VersionRef } from "./types";

/**
 * Versions are a tree kept by the browser (localStorage); the server is stateless.
 * Labels: the first version is A. Continuing from the newest version of a line counts up (A -> A1 -> A2).
 * Branching from an older version, or starting again from the scan, opens the next letter (B, B1, ...).
 */

export const STORAGE_PREFIX = "foreground.imagine.v1.";
export const MAX_VERSIONS = 24;

const LABEL = /^([A-Z]+)(\d*)$/;
const letter = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : `${letter(Math.floor(i / 26) - 1)}${String.fromCharCode(65 + (i % 26))}`);

export function nextLabel(versions: Pick<ImagineVersion, "id" | "label" | "parentId">[], parentId: string | null): string {
  const letters = new Set(versions.map((v) => LABEL.exec(v.label)?.[1]).filter(Boolean));
  const fresh = () => {
    let i = 0;
    while (letters.has(letter(i))) i++;
    return letter(i);
  };
  const parent = parentId ? versions.find((v) => v.id === parentId) : undefined;
  const m = parent ? LABEL.exec(parent.label) : null;
  if (!parent || !m) return fresh();
  const isTip = !versions.some((v) => v.parentId === parent.id);
  return isTip ? `${m[1]}${Number(m[2] || 0) + 1}` : fresh();
}

export const newVersionId = (rand: () => number = Math.random): string =>
  `v${Date.now().toString(36)}${Math.floor(rand() * 36 ** 4).toString(36).padStart(4, "0")}`.slice(0, 17);

/** Root first: A, A1, A2 for A2. */
export function lineage(versions: ImagineVersion[], id: string): ImagineVersion[] {
  const out: ImagineVersion[] = [];
  const seen = new Set<string>();
  let cur = versions.find((v) => v.id === id);
  while (cur && !seen.has(cur.id)) {
    out.unshift(cur);
    seen.add(cur.id);
    cur = cur.parentId ? versions.find((v) => v.id === cur!.parentId) : undefined;
  }
  return out;
}

/** Undo: drop a version and everything built on it; the parent becomes current. */
export function removeVersion(versions: ImagineVersion[], id: string): { versions: ImagineVersion[]; current: string | null } {
  const target = versions.find((v) => v.id === id);
  if (!target) return { versions, current: null };
  const gone = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const v of versions) if (v.parentId && gone.has(v.parentId) && !gone.has(v.id)) grew = gone.add(v.id) === gone;
  }
  return { versions: versions.filter((v) => !gone.has(v.id)), current: target.parentId };
}

/** What the server needs to build on a version: its changes, layout ops and images. */
export function toRef(v: ImagineVersion): VersionRef {
  return {
    id: v.id,
    changes: v.changeSpec.changes,
    layoutOps: v.changeSpec.layoutOps,
    images: v.images.flatMap((i) => (i.imagined ? [{ view: i.view, imagined: i.imagined }] : [])),
  };
}

export type VersionDiff = {
  cost: Range;
  seats: number;
  turnsPerDay: number;
  paybackYears: number | null;
  weeks: Range;
  /** check ids only in b, and only in a */
  checksAdded: string[];
  checksCleared: string[];
};

/** b minus a. Pass null for a to compare against the space as scanned. */
export function compareVersions(a: ImagineVersion | null, b: ImagineVersion): VersionDiff {
  const A = a ? a.numbers.after : b.numbers.before;
  const B = b.numbers.after;
  const aw = a ? a.assessment.time.totalWeeks : { low: 0, mid: 0, high: 0 };
  const bw = b.assessment.time.totalWeeks;
  const ai = new Set(a ? a.checks.map((c) => c.id) : []);
  const bi = new Set(b.checks.map((c) => c.id));
  return {
    cost: { low: B.total.low - A.total.low, mid: B.total.mid - A.total.mid, high: B.total.high - A.total.high },
    seats: B.seats - A.seats,
    turnsPerDay: B.turnsPerDay - A.turnsPerDay,
    paybackYears: A.paybackYears === null || B.paybackYears === null ? null : B.paybackYears - A.paybackYears,
    weeks: { low: bw.low - aw.low, mid: bw.mid - aw.mid, high: bw.high - aw.high },
    checksAdded: [...bi].filter((id) => !ai.has(id)),
    checksCleared: [...ai].filter((id) => !bi.has(id)),
  };
}

type Store = Pick<Storage, "getItem" | "setItem">;

/** Stored shape is checked lightly: anything that does not look like a version list is dropped, never thrown. */
export function loadVersions(store: Store, siteId: string): ImagineVersion[] {
  try {
    const raw = store.getItem(STORAGE_PREFIX + siteId);
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.filter(
      (v): v is ImagineVersion =>
        Boolean(v) && typeof v.id === "string" && typeof v.label === "string" && Array.isArray(v.changeSpec?.changes) && Array.isArray(v.checks) && Boolean(v.numbers?.after) && Boolean(v.assessment?.time),
    );
  } catch {
    return [];
  }
}

export function saveVersions(store: Store, siteId: string, versions: ImagineVersion[]): void {
  try {
    store.setItem(STORAGE_PREFIX + siteId, JSON.stringify(versions.slice(-MAX_VERSIONS)));
  } catch {
    // storage full or blocked: the session still works, it just is not remembered
  }
}
