"use client";

import { useSyncExternalStore } from "react";

/**
 * Page-wide link between a cost line, its callout in the X-ray lens and its pin in the 3D tour.
 * Hovering or focusing any one of them lights up the others. A tiny external store: no provider, no re-render of
 * anything that does not read it.
 */
type State = { finding: string | null; pano: string | null; panoFinding: string | null; panoRequest: number; walk: string | null; walkRequest: number };

let state: State = { finding: null, pano: null, panoFinding: null, panoRequest: 0, walk: null, walkRequest: 0 };
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function focusFinding(id: string | null) {
  if (state.finding !== id) set({ finding: id });
}

/** Ask the lens to switch to the camera a finding was seen from. */
export function requestPano(pano: string, finding: string | null = null) {
  set({ pano, panoFinding: finding, panoRequest: state.panoRequest + 1 });
}

/** Ask the 3D walk to take the camera to where a finding was seen and open its pin. */
export function requestWalk(finding: string) {
  set({ walk: finding, walkRequest: state.walkRequest + 1 });
}

export function useWalkRequest(): { finding: string | null; n: number } {
  const n = useSyncExternalStore(subscribe, () => state.walkRequest, () => 0);
  return { finding: state.walk, n };
}

export function useFocusedFinding(): string | null {
  return useSyncExternalStore(subscribe, () => state.finding, () => null);
}

export function usePanoRequest(): { pano: string | null; finding: string | null; n: number } {
  const n = useSyncExternalStore(subscribe, () => state.panoRequest, () => 0);
  return { pano: state.pano, finding: state.panoFinding, n };
}

/** Props that make any element a hover/focus source for a finding. */
export function linkProps(id: string | undefined) {
  if (!id) return {};
  return {
    onPointerEnter: () => focusFinding(id),
    onPointerLeave: () => focusFinding(null),
    onFocus: () => focusFinding(id),
    onBlur: () => focusFinding(null),
  };
}
