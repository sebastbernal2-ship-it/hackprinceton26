import { useEffect, useState } from "react";
import type { Match } from "./matches";
import type { StagedPiece } from "./tour-scene";
import type { WallEdits } from "./wall-edits";

/**
 * Bookmarked properties and the 3D tour design for each one (objects placed, walls changed, running total).
 * Kept in this browser's localStorage, so they survive closing the tab; they are not shared across devices.
 */

export type SavedProperty = { match: Match; savedAt: number };

export type TourDesign = {
  pieces: StagedPiece[];
  wallEdits: WallEdits;
  total: number;
  updatedAt: number;
};

const SAVED_KEY = "foreground.saved.v1";
const DESIGN_KEY = (siteId: string) => `foreground.design.v1.${siteId}`;
const CHANGE = "foreground-saved";

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked: the design still lives in the open tour
  }
  window.dispatchEvent(new Event(CHANGE));
}

export function savedProperties(): SavedProperty[] {
  const list = read<SavedProperty[]>(SAVED_KEY);
  return Array.isArray(list) ? list.filter((entry) => entry?.match?.siteId) : [];
}

export function isSaved(siteId: string): boolean {
  return savedProperties().some((entry) => entry.match.siteId === siteId);
}

/** Bookmarks the property, or removes the bookmark. Its tour design is kept either way. */
export function toggleSaved(match: Match): boolean {
  const list = savedProperties();
  const has = list.some((entry) => entry.match.siteId === match.siteId);
  write(SAVED_KEY, has ? list.filter((entry) => entry.match.siteId !== match.siteId) : [{ match, savedAt: Date.now() }, ...list]);
  return !has;
}

export function loadDesign(siteId: string): TourDesign | null {
  const design = read<TourDesign>(DESIGN_KEY(siteId));
  if (!design || !Array.isArray(design.pieces)) return null;
  // the remove / grow / slide motions already played: pin their start times far in the past
  const past = -1e9;
  return {
    ...design,
    wallEdits: {
      removed: Object.fromEntries(Object.keys(design.wallEdits?.removed ?? {}).map((key) => [key, past])),
      added: (design.wallEdits?.added ?? []).map((wall) => ({ ...wall, at: past, movedAt: wall.movedAt === undefined ? undefined : past })),
    },
  };
}

const STORED_PREFIXES = ["foreground.design.v1.", "foreground.imagine.v1.", "foreground.layout.v1."];
const STORED_EXACT = new Set(["foreground.saved.v1", "foreground.lastBrief"]);

/** Drops every bookmark, 3D tour design, Imagine version, and saved floor layout in this browser. */
export function clearStoredTours() {
  try {
    const drop: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) continue;
      if (STORED_EXACT.has(key) || STORED_PREFIXES.some((prefix) => key.startsWith(prefix))) drop.push(key);
    }
    for (const key of drop) localStorage.removeItem(key);
  } catch {
    // storage blocked: nothing persisted to clear
  }
  window.dispatchEvent(new Event(CHANGE));
}

export function saveDesign(siteId: string, design: Omit<TourDesign, "updatedAt">) {
  const empty = !design.pieces.length && !design.wallEdits.added.length && !Object.keys(design.wallEdits.removed).length;
  if (empty) {
    try {
      localStorage.removeItem(DESIGN_KEY(siteId));
    } catch {
      // nothing to clear
    }
    window.dispatchEvent(new Event(CHANGE));
    return;
  }
  write(DESIGN_KEY(siteId), { ...design, updatedAt: Date.now() });
}

function useStore<T>(get: () => T, initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const apply = () => setValue(get());
    apply();
    window.addEventListener(CHANGE, apply);
    window.addEventListener("storage", apply);
    return () => {
      window.removeEventListener(CHANGE, apply);
      window.removeEventListener("storage", apply);
    };
    // get is a stable module function per call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

export function useSaved(): SavedProperty[] {
  return useStore(savedProperties, []);
}

export function useIsSaved(siteId: string): boolean {
  const saved = useSaved();
  return saved.some((entry) => entry.match.siteId === siteId);
}

export function useDesign(siteId: string): TourDesign | null {
  const [design, setDesign] = useState<TourDesign | null>(null);
  useEffect(() => {
    const apply = () => setDesign(loadDesign(siteId));
    apply();
    window.addEventListener(CHANGE, apply);
    return () => window.removeEventListener(CHANGE, apply);
  }, [siteId]);
  return design;
}
