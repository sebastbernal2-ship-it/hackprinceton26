"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { faceForYaw, modelToThree, yawOf, type SideFace } from "@/lib/immersive/cube";
import { PANO_DISCLAIMER, type ImaginedVersion } from "@/lib/immersive/imagine-types";
import { headingWord, roomAt, walkable, type Neighbour, type WalkPano } from "@/lib/immersive/walk";
import { cn } from "@/lib/utils";
import type { FurnitureInput } from "@/lib/three-d/furniture-place";
import { PanoEngine, type GlideStat, type Resolve } from "./pano-engine";

export type WalkMode = "scanned" | "empty" | "imagined";

export type PanoViewerHandle = {
  panoId: () => string;
  /** the side face (1-4) the user is looking at: Imagine edits it first */
  lookFace: () => SideFace;
  /** the neighbour ahead in the view direction, for prefetching */
  ahead: () => string | null;
  goTo: (panoId: string) => void;
  /** turn to face a point in scan metres, as seen from `fromPanoId` (default: the pano the viewer is in) */
  lookAt: (point: { x: number; y: number; z: number }, fromPanoId?: string) => void;
  /** a slow steady turn in rad/s (0 stops it) */
  autoPan: (radPerSec: number) => void;
  /** the pano the viewer stands in, scan metres, and the way it faces (three.js yaw) */
  where: () => { panoId: string; x: number; y: number; yaw: number } | null;
  /** ids of the furniture pieces on stage */
  furnitureIds: () => string[];
  stats: () => { glides: GlideStat[]; faceFades: number };
};

/** What the walk reads of a site: its panos (with skyboxes) and rooms. A full Site fits. */
export type PanoSite = { id: string; address?: string; matterport?: { panos: WalkPano[]; rooms: { label: string; polygon?: [number, number][] }[] } | null };

export type PanoViewerProps = {
  site: PanoSite;
  initialPanoId?: string;
  mode: WalkMode;
  imaginedVersion?: ImaginedVersion | null;
  /** the owner's plan as 3D pieces standing in the scan (Room, Deal finale) */
  furniture?: FurnitureInput | null;
  /** draw the metre grid and room outlines through the furniture transform (?grid=1) */
  grid?: boolean;
  onPanoChange?: (panoId: string, info: { ahead: string | null; neighbours: string[]; hasEmpty: boolean }) => void;
  ref?: Ref<PanoViewerHandle>;
  /** fires once, when the first pano has finished loading */
  onReady?: () => void;
  /** the corner map and the "Loading the room" tag; the flow draws its own chrome */
  chrome?: boolean;
  className?: string;
  /** overlays (docks, switches) drawn above the room */
  children?: ReactNode;
};

/** Face URLs for a pano in a mode. Imagined: the edited faces over the base (empty when there is one, else scanned). */
export function makeResolver(panos: WalkPano[], mode: WalkMode, imagined?: ImaginedVersion | null): Resolve {
  const byId = new Map(panos.map((p) => [p.id, p]));
  return (id) => {
    const p = byId.get(id);
    const scanned = p?.skybox ?? [];
    const empty = p?.skyboxEmpty?.length === 6 ? p.skyboxEmpty : null;
    if (mode === "scanned") return scanned;
    if (mode === "empty") return empty ?? scanned;
    const over = imagined?.panos[id] ?? {};
    return (empty ?? scanned).map((u, i) => over[i as 0] ?? u);
  };
}

export function PanoViewer({ site, initialPanoId, mode, imaginedVersion, furniture, grid, onPanoChange, onReady, chrome = true, ref, className, children }: PanoViewerProps) {
  const panos = useMemo(() => walkable(site.matterport?.panos ?? []), [site]);
  const rooms = useMemo(() => site.matterport?.rooms ?? [], [site]);
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<PanoEngine | null>(null);
  const coneRef = useRef<HTMLDivElement>(null);
  const resolverRef = useRef<Resolve>(makeResolver(panos, mode, imaginedVersion));
  const modeRef = useRef(mode);
  const onPanoRef = useRef(onPanoChange);
  const onReadyRef = useRef(onReady);
  const readyFired = useRef(false);
  useEffect(() => {
    onPanoRef.current = onPanoChange;
    onReadyRef.current = onReady;
  });
  const [panoId, setPanoId] = useState(initialPanoId && panos.some((p) => p.id === initialPanoId) ? initialPanoId : panos[0]?.id);
  const [near, setNear] = useState<Neighbour[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  // engine lifetime: one per site
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !panos.length) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let noticeTimer = 0;
    const engine = new PanoEngine(host, {
      panos,
      startId: panoId ?? panos[0].id,
      resolve: resolverRef.current,
      reducedMotion: reduce.matches,
      onPano: (id, list) => {
        setPanoId(id);
        setNear(list);
        const p = panos.find((x) => x.id === id);
        onPanoRef.current?.(id, { ahead: engineRef.current?.ahead()?.id ?? null, neighbours: list.map((n) => n.id), hasEmpty: p?.skyboxEmpty?.length === 6 });
      },
      onView: (yaw) => {
        if (coneRef.current) coneRef.current.style.transform = `translate(-50%, -100%) rotate(${(-yaw * 180) / Math.PI}deg)`;
      },
      onLoading: (l) => {
        setLoading(l);
        if (!l && !readyFired.current) {
          readyFired.current = true;
          onReadyRef.current?.();
        }
      },
      onBlocked: (m) => {
        setNotice(m);
        window.clearTimeout(noticeTimer);
        noticeTimer = window.setTimeout(() => setNotice(null), 2600);
      },
    });
    engineRef.current = engine;
    const onReduce = () => engine.setReducedMotion(reduce.matches);
    reduce.addEventListener("change", onReduce);
    if (process.env.NODE_ENV !== "production") (window as unknown as { __walk?: PanoEngine }).__walk = engine;
    return () => {
      reduce.removeEventListener("change", onReduce);
      window.clearTimeout(noticeTimer);
      engine.dispose();
      engineRef.current = null;
    };
    // the engine is created once per site; pano and mode changes go through its methods
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panos]);

  // face sources: a mode switch wipes from the pointer, imagined faces fade in one by one
  useEffect(() => {
    const resolve = makeResolver(panos, mode, imaginedVersion);
    resolverRef.current = resolve;
    const modeChanged = modeRef.current !== mode;
    modeRef.current = mode;
    engineRef.current?.setResolver(resolve, modeChanged ? "pointer" : undefined);
  }, [panos, mode, imaginedVersion]);

  // the owner's furniture: one transform, redone when the plan moves or the engine is rebuilt
  useEffect(() => {
    engineRef.current?.setFurniture(furniture ?? null, Boolean(grid));
  }, [furniture, grid, panos]);

  // announce where you are
  useEffect(() => {
    const p = panos.find((x) => x.id === panoId);
    if (!p) return;
    const i = panos.indexOf(p);
    const room = roomAt(rooms, p.position);
    const heading = headingWord(engineRef.current?.viewYaw ?? 0);
    setAnnounce(`${room ?? "Walk"}: spot ${i + 1} of ${panos.length}, facing ${heading}. ${near.length} ${near.length === 1 ? "place" : "places"} to step to.`);
  }, [panoId, near, panos, rooms]);

  useImperativeHandle(
    ref,
    () => ({
      panoId: () => engineRef.current?.panoId ?? panoId ?? "",
      lookFace: () => {
        const e = engineRef.current;
        const p = panos.find((x) => x.id === e?.panoId);
        return faceForYaw(e?.viewYaw ?? 0, p?.rotation);
      },
      ahead: () => engineRef.current?.ahead()?.id ?? null,
      goTo: (id) => void engineRef.current?.goTo(id),
      lookAt: (point, fromId) => {
        const e = engineRef.current;
        const from = panos.find((x) => x.id === (fromId ?? e?.panoId));
        if (!e || !from) return;
        const [fx, , fz] = modelToThree(from.position);
        const [tx, , tz] = modelToThree(point);
        if (Math.hypot(tx - fx, tz - fz) < 0.3) return;
        e.setView(yawOf(tx - fx, tz - fz), 0);
      },
      where: () => {
        const e = engineRef.current;
        return e ? { panoId: e.panoId, x: e.position.x, y: e.position.y, yaw: e.viewYaw } : null;
      },
      furnitureIds: () => engineRef.current?.furnitureIds ?? [],
      autoPan: (v) => engineRef.current?.setAutoYaw(v),
      stats: () => engineRef.current?.stats ?? { glides: [], faceFades: 0 },
    }),
    [panos, panoId],
  );

  if (!panos.length) return <div className={cn("grid place-items-center bg-ink text-on-ink-2", className)}>No 360 views for this site.</div>;

  return (
    <div className={cn("relative overflow-hidden bg-[#16181c] text-on-ink", className)}>
      <div
        ref={hostRef}
        tabIndex={0}
        role="application"
        aria-roledescription="360 walk"
        aria-label="Walk through the space. Drag or use the left and right arrow keys to look around, up arrow or W to step forward, down arrow or S to step back, Shift with up or down to look up or down, plus and minus to zoom."
        className="absolute inset-0 cursor-grab outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        onKeyDown={(e) => {
          if (engineRef.current?.keyDown(e.nativeEvent)) e.preventDefault();
        }}
        onKeyUp={(e) => engineRef.current?.keyUp(e.nativeEvent)}
        onBlur={() => engineRef.current?.blur()}
      />
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>

      {mode === "imagined" && (
        <p className="pointer-events-none absolute top-[4.75rem] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm bg-ink/80 px-2 py-1 text-[0.75rem] font-medium tracking-[0.06em] text-on-ink backdrop-blur-sm">
          {PANO_DISCLAIMER}
        </p>
      )}
      {chrome && loading && (
        <p role="status" className="pointer-events-none absolute top-3 right-3 rounded-sm bg-ink/80 px-2 py-1 text-[0.75rem] text-on-ink-2">
          Loading the room…
        </p>
      )}
      {notice && (
        <p role="status" className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-ink/85 px-3 py-2 text-sm text-on-ink">
          {notice}
        </p>
      )}

      {chrome && <Minimap panos={panos} rooms={rooms} current={panoId} near={near} coneRef={coneRef} onJump={(id) => void engineRef.current?.goTo(id)} />}
      {children}
    </div>
  );
}

function Minimap({
  panos,
  rooms,
  current,
  near,
  coneRef,
  onJump,
}: {
  panos: WalkPano[];
  rooms: { label: string; polygon?: [number, number][] }[];
  current?: string;
  near: Neighbour[];
  coneRef: Ref<HTMLDivElement>;
  onJump: (id: string) => void;
}) {
  const SIZE = 168;
  const PAD = 16;
  const box = useMemo(() => {
    const xs = panos.map((p) => p.position.x);
    const ys = panos.map((p) => p.position.y);
    const minX = Math.min(...xs);
    const maxY = Math.max(...ys);
    const span = Math.max(Math.max(...xs) - minX, maxY - Math.min(...ys), 4);
    const s = (SIZE - PAD * 2) / span;
    const w = (Math.max(...xs) - minX) * s;
    const h = (maxY - Math.min(...ys)) * s;
    const ox = (SIZE - w) / 2;
    const oy = (SIZE - h) / 2;
    return { at: (x: number, y: number) => ({ left: ox + (x - minX) * s, top: oy + (maxY - y) * s }) };
  }, [panos]);
  const nearIds = new Set(near.map((n) => n.id));
  return (
    <nav aria-label="Map of the space" className="absolute bottom-3 left-3 rounded-sm bg-ink/75 backdrop-blur-sm" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} className="pointer-events-none absolute inset-0" aria-hidden="true">
        {rooms.map((r, i) =>
          r.polygon && r.polygon.length > 2 ? (
            <polygon
              key={i}
              points={r.polygon.map(([x, y]) => `${box.at(x, y).left},${box.at(x, y).top}`).join(" ")}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.25}
              strokeWidth={1}
            />
          ) : null,
        )}
      </svg>
      {panos.map((p, i) => {
        const { left, top } = box.at(p.position.x, p.position.y);
        const here = p.id === current;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onJump(p.id)}
            aria-label={here ? `Spot ${i + 1}, you are here` : `Go to spot ${i + 1}`}
            aria-current={here ? "location" : undefined}
            className="absolute grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ left, top }}
          >
            <span className={cn("block rounded-full transition-transform", here ? "size-2.5 bg-on-ink" : nearIds.has(p.id) ? "size-2 bg-on-ink/80" : "size-1.5 bg-on-ink-2/60")} />
          </button>
        );
      })}
      {current && (
        <div
          ref={coneRef}
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{ ...pos(box.at, panos.find((p) => p.id === current)!), width: 36, height: 30, transformOrigin: "50% 100%", transform: "translate(-50%, -100%)" }}
        >
          <svg width="36" height="30" viewBox="0 0 36 30">
            <defs>
              <linearGradient id="walk-cone" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0" stopColor="white" stopOpacity="0.55" />
                <stop offset="1" stopColor="white" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M18 30 L1 2 Q18 -4 35 2 Z" fill="url(#walk-cone)" />
          </svg>
        </div>
      )}
    </nav>
  );
}

const pos = (at: (x: number, y: number) => { left: number; top: number }, p: WalkPano) => at(p.position.x, p.position.y);
