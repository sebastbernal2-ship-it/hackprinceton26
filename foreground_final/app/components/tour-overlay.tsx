"use client";

import { setupSdk, type MpSdk } from "@matterport/sdk";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  applyStructure,
  buildLayout,
  buildLayoutFromScan,
  type FloorLayout,
  type MeasuredRoom,
  type StructureEdit,
} from "../lib/floor-layout";
import { readPose, yawRadians, type RoomAnchor, type StagedPiece } from "../lib/tour-scene";
import type { LayoutDecision } from "../lib/layout-catalog";
import { additionPrice, buildWall, EMPTY_EDITS, numberWalls, removalPrice, wallKey, type NumberedWall, type WallEdits } from "../lib/wall-edits";
import { loadDesign, saveDesign } from "../lib/saved";
import { fitFrame, roomSpot, toPlan, toWorld, turnToPlan, turnToWorld, vecToPlan, type ScanGeometry } from "../lib/frame-map";
import { canStand, nearestFree, slideTo, standingSegments, summarizeSpaces, type Placed } from "../lib/placement";
import ForegroundTour from "./foreground-tour";
import TourModels from "./tour-models";
import TourChat from "./tour-chat";

type TourMode = "matterport" | "imagine";

type TourOverlayProps = {
  /** data/sites id: the 360 Imagine view and its renders are keyed by it */
  siteId?: string;
  tourId: string;
  title: string;
  detail?: string;
  squareFeet: number;
  openChat?: boolean;
  onClose: () => void;
};

export default function TourOverlay({ siteId, tourId, title, detail, squareFeet, openChat = false, onClose }: TourOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [sdk, setSdk] = useState<MpSdk | null>(null);
  const [chatOpen, setChatOpen] = useState(openChat);
  // the design saved for this property last time (objects, wall changes, running total), restored on open
  const [restored] = useState(() => (siteId ? loadDesign(siteId) : null));
  const [pieces, setPieces] = useState<StagedPiece[]>(() => restored?.pieces ?? []);
  const [total, setTotal] = useState(() => restored?.total ?? 0);
  // what the move pad acts on: the object or added wall you clicked or dragged (or the object just added).
  // Clicking away clears it and the pad goes away.
  const [picked, setPicked] = useState<string | null>(null);
  const [pickedWall, setPickedWall] = useState<string | null>(null);
  const selected = pieces.find((piece) => piece.id === picked) ?? null;
  const pickPiece = useCallback((id: string | null) => {
    setPicked(id);
    if (id) setPickedWall(null);
  }, []);
  const pickWall = useCallback((key: string | null) => {
    setPickedWall(key);
    if (key) setPicked(null);
  }, []);
  // a new object is picked as it arrives, so the pad is ready to move it
  const lastId = pieces[pieces.length - 1]?.id ?? null;
  const [seenLast, setSeenLast] = useState(lastId);
  const [restoredIds] = useState(() => new Set((restored?.pieces ?? []).map((piece) => piece.id)));
  if (lastId !== seenLast) {
    setSeenLast(lastId);
    if (lastId && !restoredIds.has(lastId) && pieces.length > 0) {
      setPicked(lastId);
      setPickedWall(null);
    }
  }

  // clicks inside the Matterport scan never reach this page; the page losing focus to the scan's frame is the
  // click, and like a click on empty floor in Imagine, it puts the move pad away
  useEffect(() => {
    const onBlur = () => {
      setTimeout(() => {
        if (document.activeElement instanceof HTMLIFrameElement) {
          setPicked(null);
          setPickedWall(null);
        }
      }, 0);
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, []);

  // a move is requested as an offset in plan metres; the resolver below applies it under the wall rules
  const nudge = useCallback((id: string, dx: number, dz: number) => {
    setPieces((list) => list.map((piece) => (piece.id === id ? { ...piece, offset: { dx: (piece.offset?.dx ?? 0) + dx, dz: (piece.offset?.dz ?? 0) + dz } } : piece)));
  }, []);
  const [scanGeo, setScanGeo] = useState<ScanGeometry | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const turn = useCallback((id: string) => {
    setPieces((list) => list.map((piece) => (piece.id === id ? { ...piece, turn: ((piece.turn ?? 0) + Math.PI / 4) % (Math.PI * 2) } : piece)));
  }, []);
  const [anchors, setAnchors] = useState<RoomAnchor[]>([]);
  const [mode, setMode] = useState<TourMode>("matterport");
  const visible = selected;
  const [layout, setLayout] = useState<FloorLayout>(() => buildLayout(squareFeet));
  const [planError, setPlanError] = useState<string | null>(null);
  const [wallEdits, setWallEdits] = useState<WallEdits>(() => restored?.wallEdits ?? EMPTY_EDITS);

  // every change to the design is saved for this property, so the Saved tab can reopen it as it was
  useEffect(() => {
    if (!siteId) return;
    const timer = setTimeout(() => saveDesign(siteId, { pieces, wallEdits, total }), 400);
    return () => clearTimeout(timer);
  }, [siteId, pieces, wallEdits, total]);
  // wall numbers stay put for the whole session: a wall keeps its number while it stands
  // (a new floorplan, not an edit, starts the numbering over at 1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const wallNumbers = useMemo(() => new Map<string, number>(), [layout.source, layout.measuredKey]);
  const walls = useMemo(() => numberWalls(layout, wallEdits, wallNumbers), [layout, wallEdits, wallNumbers]);

  // ---- one position for every object, on the traced plan, shared by both tours
  const frame = useMemo(() => fitFrame(layout, scanGeo), [layout, scanGeo]);
  const standing = useMemo(() => standingSegments(walls, wallEdits), [walls, wallEdits]);
  const footprintOf = (piece: StagedPiece) => ({ id: piece.id, width: piece.width ?? 1, depth: piece.depth ?? 1, turn: piece.turn ?? 0 });
  const placedOf = useCallback(
    (list: StagedPiece[]): Placed[] => list.flatMap((piece) => (piece.plan ? [{ ...footprintOf(piece), x: piece.plan.x, z: piece.plan.z }] : [])),
    [],
  );

  // Resolves every object onto the plan: new Imagine objects go to a free spot in their room, Matterport objects are
  // carried over from the scan, and requested moves (drag, arrows, chat) slide under the same wall rules.
  useEffect(() => {
    if (layout.source !== "plan") return;
    const dropped: StagedPiece[] = [];
    {
      let changed = false;
      const counts = new Map<string, number>();
      const next: StagedPiece[] = [];
      for (const piece of pieces) {
        let q = piece;
        const others = placedOf(next);
        if (!q.plan) {
          let want: { x: number; z: number } | null = null;
          let turnPlan = q.turn ?? 0;
          if (q.placedIn === "matterport") {
            if (!frame) {
              next.push(q);
              continue;
            }
            want = toPlan(frame, { x: q.position.x + (q.offset?.dx ?? 0), z: q.position.z + (q.offset?.dz ?? 0) });
            turnPlan = turnToPlan(frame, (q.yaw ?? 0) + (q.turn ?? 0));
          } else {
            const room = q.room ?? "";
            const count = counts.get(room) ?? 0;
            counts.set(room, count + 1);
            const spot = roomSpot(layout, room, count, { width: q.width ?? 1, depth: q.depth ?? 1 });
            want = spot ? { x: spot.x + (q.offset?.dx ?? 0), z: spot.z + (q.offset?.dz ?? 0) } : null;
          }
          const fp = { ...footprintOf(q), turn: turnPlan };
          const free =
            (want && nearestFree(layout, standing, fp, want.x, want.z, others)) ??
            (() => {
              const spot = roomSpot(layout, q.room ?? "", 0, fp);
              return spot ? nearestFree(layout, standing, fp, spot.x, spot.z, others, 8) : null;
            })();
          changed = true;
          if (!free) {
            dropped.push(q);
            continue;
          }
          q = { ...q, plan: free, turn: turnPlan, yaw: 0, offset: undefined };
        } else if (q.offset && (q.offset.dx || q.offset.dz)) {
          const to = { x: q.plan!.x + q.offset.dx, z: q.plan!.z + q.offset.dz };
          q = { ...q, plan: slideTo(layout, standing, footprintOf(q), q.plan!, to, others), offset: undefined };
          changed = true;
        } else if (!canStand(layout, standing, footprintOf(q), q.plan.x, q.plan.z, others)) {
          // the space changed under it (a wall went up through it, or it turned into a wall): nearest free spot
          const free = nearestFree(layout, standing, footprintOf(q), q.plan.x, q.plan.z, others, 6);
          changed = true;
          if (!free) {
            dropped.push(q);
            continue;
          }
          q = { ...q, plan: free };
        }
        next.push(q);
      }
      // converges: it only commits when a piece was placed or moved, and placed pieces are left alone after
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (changed) setPieces(next);
    }
    if (dropped.length) {
      setTotal((t) => Math.max(0, t - dropped.reduce((sum, piece) => sum + (piece.price ?? 0), 0)));
      setNotice(`${dropped.map((piece) => piece.product?.name ?? piece.custom?.name ?? piece.label.split(" · ")[0]).join(", ")} did not fit anywhere in this space, so it was taken out and refunded.`);
    }
  }, [layout, frame, standing, pieces, placedOf]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  // the space as it is now, for the layout agent: walls removed merge rooms, walls added split them
  const spaces = useMemo(
    () => (layout.source === "plan" ? summarizeSpaces(layout, walls, wallEdits, placedOf(pieces)) : []),
    [layout, walls, wallEdits, pieces, placedOf],
  );

  // The Matterport tour draws the same objects, carried from the plan into the scan's world.
  const scanPieces = useMemo(
    () =>
      pieces.flatMap((piece) => {
        if (piece.plan && frame) {
          const w = toWorld(frame, { x: piece.plan.x + (piece.offset?.dx ?? 0), z: piece.plan.z + (piece.offset?.dz ?? 0) });
          return [{ ...piece, position: { x: w.x, y: frame.floorY, z: w.z }, yaw: turnToWorld(frame, piece.turn ?? 0), turn: 0, offset: undefined }];
        }
        return piece.placedIn === "matterport" && !piece.plan ? [piece] : [];
      }),
    [pieces, frame],
  );

  /** Live drag check, plan metres: may this object stand here? */
  const canStandPlan = useCallback(
    (id: string, x: number, z: number) => {
      const piece = pieces.find((entry) => entry.id === id);
      if (!piece || layout.source !== "plan") return true;
      return canStand(layout, standing, footprintOf(piece), x, z, placedOf(pieces.filter((entry) => entry.id !== id)));
    },
    [pieces, layout, standing, placedOf],
  );
  /** The same check from the scan's world (the Matterport tour's drag). */
  const canStandWorld = useCallback(
    (id: string, x: number, z: number) => {
      if (!frame) return true;
      const p = toPlan(frame, { x, z });
      return canStandPlan(id, p.x, p.z);
    },
    [frame, canStandPlan],
  );
  /** A Matterport-tour move (scan metres) as a plan move. */
  const worldMove = useCallback(
    (id: string, offset: { dx: number; dz: number }) => {
      const piece = pieces.find((entry) => entry.id === id);
      if (piece?.plan && frame) {
        const d = vecToPlan(frame, offset);
        setPieces((list) => list.map((entry) => (entry.id === id ? { ...entry, offset: { dx: d.dx, dz: d.dz } } : entry)));
      } else {
        setPieces((list) => list.map((entry) => (entry.id === id ? { ...entry, offset } : entry)));
      }
    },
    [pieces, frame],
  );

  const editWalls = useCallback(
    (action: Extract<LayoutDecision["action"], { type: "walls" }>): { addedCost: number; errors: string[] } => {
      const now = performance.now();
      // new walls are built (and checked) first, so only walls that really stand are charged, at their real length
      const built: { x1: number; z1: number; x2: number; z2: number }[] = [];
      const errors: string[] = [];
      for (const spec of action.add) {
        const result = buildWall(layout, walls, spec);
        if ("error" in result) errors.push(result.error);
        else built.push(result.segment);
      }
      const addedCost = built.reduce((sum, seg) => sum + additionPrice(Math.hypot(seg.x2 - seg.x1, seg.z2 - seg.z1)), 0);
      setWallEdits((current) => {
        const removed = { ...current.removed };
        let added = [...current.added];
        for (const n of action.remove) {
          const wall = walls.find((w) => w.number === n);
          if (!wall || removed[wall.key] !== undefined) continue;
          removed[wall.key] = now;
        }
        for (const n of action.restore) {
          const wall = walls.find((w) => w.number === n);
          if (wall) delete removed[wall.key];
        }
        for (const step of action.move ?? []) {
          const wall = walls.find((w) => w.number === step.wall && w.role === "added");
          if (!wall) continue;
          added = added.map((w) => {
            if (w.key !== wall.key) return w;
            const prev = { x1: w.x1, z1: w.z1, x2: w.x2, z2: w.z2 };
            return { ...w, x1: w.x1 + step.dx, z1: w.z1 + step.dz, x2: w.x2 + step.dx, z2: w.z2 + step.dz, prev, movedAt: now };
          });
        }
        built.forEach((segment, index) => {
          added = [...added, { ...segment, key: `added:${wallKey(segment)}:${Math.round(now)}`, at: now + index * 400 }];
        });
        return { removed, added };
      });
      return { addedCost, errors };
    },
    [walls, layout],
  );

  /** Takes an object out and gives its price back. */
  const removePiece = useCallback((id: string) => {
    const piece = pieces.find((entry) => entry.id === id);
    if (!piece) return;
    setPieces((list) => list.filter((entry) => entry.id !== id));
    setTotal((t) => Math.max(0, t - (piece.price ?? 0)));
    setPicked((current) => (current === id ? null : current));
  }, [pieces]);

  /** The minus tag on a wall: a scanned wall comes down (charged as demolition), an added wall is taken back (refunded). */
  const removeWall = useCallback(
    (wallNumber: number) => {
      const wall = walls.find((entry) => entry.number === wallNumber);
      if (!wall) return;
      if (wall.role === "added") {
        setWallEdits((current) => ({ ...current, added: current.added.filter((entry) => entry.key !== wall.key) }));
        setTotal((t) => Math.max(0, t - additionPrice(wall.length)));
        setPickedWall((current) => (current === wall.key ? null : current));
        return;
      }
      editWalls({ type: "walls", remove: [wallNumber], restore: [], add: [], price: 0 });
      setTotal((t) => t + removalPrice(wall));
    },
    [walls, editWalls],
  );

  /** Slides an added wall by (dx, dz) plan metres, free, as long as it stays on the floor. */
  const canPlaceWall = useCallback(
    (key: string, dx: number, dz: number) => {
      const wall = wallEdits.added.find((entry) => entry.key === key);
      const floor = (layout.polygons ?? []).filter((poly) => !poly.absorbed && poly.points.length >= 3).map((poly) => poly.points);
      if (!wall || !floor.length) return Boolean(wall);
      const onFloor = (x: number, z: number) => floor.some((poly) => pointIn(poly, x, z));
      const mx = (wall.x1 + wall.x2) / 2 + dx;
      const mz = (wall.z1 + wall.z2) / 2 + dz;
      // its middle on the floor and both ends within reach of it (walls end at the room's edges)
      return onFloor(mx, mz) && onFloor(mx + (wall.x1 - (wall.x1 + wall.x2) / 2) * 0.9, mz + (wall.z1 - (wall.z1 + wall.z2) / 2) * 0.9) && onFloor(mx + (wall.x2 - (wall.x1 + wall.x2) / 2) * 0.9, mz + (wall.z2 - (wall.z1 + wall.z2) / 2) * 0.9);
    },
    [wallEdits, layout],
  );
  const moveWall = useCallback(
    (key: string, dx: number, dz: number, animate = false) => {
      if (!canPlaceWall(key, dx, dz)) return;
      const now = performance.now();
      setWallEdits((current) => ({
        ...current,
        added: current.added.map((wall) =>
          wall.key === key
            ? {
                ...wall,
                x1: wall.x1 + dx,
                z1: wall.z1 + dz,
                x2: wall.x2 + dx,
                z2: wall.z2 + dz,
                prev: animate ? { x1: wall.x1, z1: wall.z1, x2: wall.x2, z2: wall.z2 } : undefined,
                movedAt: animate ? now : undefined,
              }
            : wall,
        ),
      }));
    },
    [canPlaceWall],
  );
  /** Turns an added wall a quarter turn about its middle. */
  const turnWall = useCallback(
    (key: string) => {
      setWallEdits((current) => ({
        ...current,
        added: current.added.map((wall) => {
          if (wall.key !== key) return wall;
          const mx = (wall.x1 + wall.x2) / 2;
          const mz = (wall.z1 + wall.z2) / 2;
          const hx = (wall.x2 - wall.x1) / 2;
          const hz = (wall.z2 - wall.z1) / 2;
          return { ...wall, x1: mx + hz, z1: mz - hx, x2: mx - hz, z2: mz + hx, prev: undefined, movedAt: undefined };
        }),
      }));
    },
    [],
  );
  const selectedWall = walls.find((wall) => wall.key === pickedWall && wallEdits.removed[wall.key] === undefined) ?? null;

  function editStructure(edit: StructureEdit) {
    setLayout((current) => applyStructure(current, edit));
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (chatOpen) {
        setChatOpen(false);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, chatOpen]);

  useEffect(() => {
    const host = containerRef.current;
    const sdkKey = process.env.NEXT_PUBLIC_MATTERPORT_SDK_KEY;
    if (!host) return;

    let cancelled = false;
    let connected: MpSdk | null = null;

    async function openTour() {
      if (!sdkKey) {
        setStatus("error");
        setError("Matterport SDK key is missing. Add NEXT_PUBLIC_MATTERPORT_SDK_KEY to foreground/.env.local.");
        return;
      }

      setStatus("loading");
      setError(null);
      setSdk(null);
      // pieces are kept: they may be a saved design restored for this property
      setMode("matterport");
      setLayout(buildLayout(squareFeet));
      setPlanError(null);
      host!.replaceChildren();

      try {
        // play=1 skips the title card; qs=0 keeps the dollhouse fly-in instead of jumping inside.
        connected = await setupSdk(sdkKey, {
          space: tourId,
          container: host!,
          iframeAttributes: {
            class: "h-full w-full border-0",
            allow: "fullscreen; xr-spatial-tracking",
            allowfullscreen: "true",
          },
          iframeQueryParams: {
            play: 1,
            qs: 0,
            dh: 1,
            brand: 0,
            title: 0,
          },
        });
        if (cancelled) return;

        await connected.App.state.waitUntil((state) => state.phase === connected!.App.Phase.PLAYING);
        if (cancelled) return;

        // Land in dollhouse (aerial) so the user can rotate the exterior, then click in to go inside.
        await connected.Mode.moveTo(connected.Mode.Mode.DOLLHOUSE, {
          transition: connected.Camera.TransitionType.FLY,
        });
        if (cancelled) return;

        setSdk(connected);
        setStatus("ready");
      } catch (cause) {
        if (cancelled) return;
        console.error(cause);
        setStatus("error");
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not open the Matterport tour. The SDK key only works on allow-listed domains like localhost.",
        );
      }
    }

    void openTour();

    return () => {
      cancelled = true;
      host.replaceChildren();
      connected = null;
    };
  }, [tourId, squareFeet]);

  useEffect(() => {
    if (!sdk) return;
    const scan = { rooms: [] as MeasuredRoom[], sweeps: [] as { x: number; z: number }[] };
    const publish = () => {
      const next = buildLayoutFromScan(scan.rooms, scan.sweeps);
      if (next.source !== "scan") return;
      setLayout((current) => {
        if (current.source === "plan") return current;
        if (current.measuredKey === next.measuredKey && current.source === "scan") return current;
        return current.freezerRemoved ? applyStructure(next, { kind: "remove-freezer" }) : next;
      });
    };
    const subscription = sdk.Room.data.subscribe({
      onCollectionUpdated(collection) {
        setScanGeo((current) => ({
          sweeps: current?.sweeps ?? [],
          rooms: Object.values(collection).map((entry) => ({
            label: entry.label || "Room",
            min: { x: entry.bounds.min.x, y: entry.bounds.min.y, z: entry.bounds.min.z },
            max: { x: entry.bounds.max.x, y: entry.bounds.max.y, z: entry.bounds.max.z },
          })),
        }));
        scan.rooms = Object.values(collection).map((entry) => ({
          id: entry.id,
          label: entry.label || "Room",
          min: { x: entry.bounds.min.x, z: entry.bounds.min.z },
          max: { x: entry.bounds.max.x, z: entry.bounds.max.z },
          floor: entry.floorInfo?.sequence ?? 0,
        }));
        setAnchors(
          scan.rooms.map((entry) => ({
            label: entry.label,
            position: {
              x: (entry.min.x + entry.max.x) / 2,
              y: 0,
              z: (entry.min.z + entry.max.z) / 2,
            },
          })),
        );
        publish();
      },
    });
    const sweeps = sdk.Sweep.data.subscribe({
      onCollectionUpdated(collection) {
        scan.sweeps = Object.values(collection).map((entry) => ({ x: entry.position.x, z: entry.position.z }));
        setScanGeo((current) => ({
          rooms: current?.rooms ?? [],
          sweeps: Object.values(collection).map((entry) => ({ x: entry.position.x, y: entry.position.y, z: entry.position.z })),
        }));
        publish();
      },
    });
    return () => {
      subscription.cancel();
      sweeps.cancel();
    };
  }, [sdk]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/layout-analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ modelId: tourId, squareFeet }),
          signal: controller.signal,
        });
        const data = (await response.json()) as { layout?: FloorLayout | null; error?: string };
        if (!response.ok || !data.layout || data.layout.source !== "plan") {
          if (!controller.signal.aborted) setPlanError(data.error || "The floorplan could not be traced.");
          return;
        }
        setPlanError(null);
        setLayout((current) => {
          if (current.measuredKey === data.layout!.measuredKey && current.source === "plan") return current;
          return current.freezerRemoved ? applyStructure(data.layout!, { kind: "remove-freezer" }) : data.layout!;
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setPlanError(error instanceof Error ? error.message : "The floorplan could not be traced.");
      }
    })();
    return () => controller.abort();
  }, [tourId, squareFeet]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelId}
      className="fixed inset-0 z-50 flex flex-col bg-foreground text-background animate-rise"
    >
      <header className="flex shrink-0 items-center gap-4 px-4 py-3 md:px-6">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-background/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-background/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Close
        </button>
        <div className="min-w-0 flex-1 pr-14">
          <h2 id={labelId} className="truncate text-sm font-medium tracking-tight">
            {title}
            {detail ? ` · ${detail}` : ""}
          </h2>
          <p className="truncate text-xs text-background/55">
            {mode === "imagine"
              ? "Imagine — add any object or change walls by number; the layout agent builds it in 3D"
              : status !== "ready"
                ? "Opening tour…"
                : "Walkthrough — click into the model to go inside, then move room to room"}
          </p>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 bg-foreground">
        <div className={`absolute inset-0 ${mode === "imagine" ? "z-10" : "invisible pointer-events-none"}`}>
          {layout.source !== "pending" ? (
            <ForegroundTour
              title={title}
              detail={detail}
              squareFeet={squareFeet}
              layout={layout}
              pieces={pieces}
              walls={walls}
              wallEdits={wallEdits}
              selectedId={visible?.id ?? null}
              onPieceSelect={pickPiece}
              onPieceMove={(id, offset) => setPieces((list) => list.map((piece) => (piece.id === id ? { ...piece, offset } : piece)))}
              canStand={canStandPlan}
              selectedWallKey={selectedWall?.key ?? null}
              onWallSelect={pickWall}
              onWallMove={(key, dx, dz) => moveWall(key, dx, dz)}
              canPlaceWall={canPlaceWall}
              onPieceRemove={removePiece}
              onWallRemove={removeWall}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-[#141413] px-8 text-center text-background/70">
              <p className="max-w-md text-sm">{planError ?? "Building the Imagine model from the scan with Gemini… this can take a minute the first time."}</p>
            </div>
          )}
        </div>
        <div ref={containerRef} className={`absolute inset-0 ${mode === "matterport" ? "" : "invisible pointer-events-none"}`} />
        {mode === "matterport" && (
          <TourModels
            sdk={sdk}
            pieces={scanPieces}
            selectedId={visible?.id ?? null}
            onPieceSelect={pickPiece}
            onPieceMove={worldMove}
            onPieceRemove={removePiece}
            canStand={canStandWorld}
          />
        )}
        <TourModeSwitch mode={mode} onChange={setMode} />
        {notice && (
          <p role="status" className="absolute left-1/2 top-20 z-30 max-w-md -translate-x-1/2 rounded-2xl bg-[#ece7dd] px-4 py-2.5 text-center text-sm text-foreground shadow-[0_10px_30px_rgb(0_0_0/0.28)]">
            {notice}
          </p>
        )}
        {selectedWall && mode === "imagine" && (
          <PieceControls
            title={selectedWall.role === "added" ? `New wall ${selectedWall.number}` : `Wall ${selectedWall.number}`}
            subtitle={
              selectedWall.role === "added"
                ? `${selectedWall.length.toFixed(1)} m · drag it, or use the arrows · free`
                : `${selectedWall.length.toFixed(1)} m ${selectedWall.between} · removing it costs ${usd(removalPrice(selectedWall))}`
            }
            onNudge={selectedWall.role === "added" ? (sx, sz) => moveWall(selectedWall.key, sx, sz, true) : undefined}
            onTurn={selectedWall.role === "added" ? () => turnWall(selectedWall.key) : undefined}
            onRemove={() => removeWall(selectedWall.number)}
            removeLabel={selectedWall.role === "added" ? "Remove" : "Take this wall down"}
            onClose={() => pickWall(null)}
          />
        )}
        <CostLedger pieces={pieces} walls={walls} wallEdits={wallEdits} total={total} />
        {visible && (mode === "imagine" ? layout.source !== "pending" : status === "ready") && (
          <PieceControls
            title={visible.product?.name ?? visible.custom?.name ?? visible.label.split(" · ")[0]}
            subtitle="Drag it, or use the arrows · free"
            google={visible.product?.google}
            onRemove={() => removePiece(visible.id)}
            onClose={() => pickPiece(null)}
            onNudge={(sx, sz) => {
              if (mode !== "matterport" || !sdk) return nudge(visible.id, sx, sz);
              // in the walkthrough the arrows follow your view: right is screen-right, up is away from you
              void readPose(sdk).then((pose) => {
                const yaw = yawRadians(pose.rotation.y);
                const c = Math.cos(yaw);
                const s = Math.sin(yaw);
                const world = { dx: c * sx + s * sz, dz: -s * sx + c * sz };
                if (visible.plan && frame) {
                  const d = vecToPlan(frame, world);
                  nudge(visible.id, d.dx, d.dz);
                } else nudge(visible.id, world.dx, world.dz);
              });
            }}
            onTurn={() => turn(visible.id)}
          />
        )}

        {/* one layout agent for both tours: furniture in either, walls in Imagine */}
        {((mode === "imagine" && layout.source !== "pending") || (mode === "matterport" && status === "ready")) && (
          <TourChat
            sdk={mode === "matterport" ? sdk : null}
            open={chatOpen}
            onOpenChange={setChatOpen}
            pieces={pieces}
            onPiecesChange={setPieces}
            mode={mode === "imagine" ? "foreground" : "matterport"}
            walls={walls}
            wallEdits={wallEdits}
            onWalls={editWalls}
            total={total}
            onTotalChange={setTotal}
            siteId={siteId}
            spaces={spaces}
            freezerRemoved={layout.freezerRemoved}
            hasFreezer={layout.rooms.some((entry) => entry.kind === "freezer")}
            rooms={layout.rooms}
            anchors={anchors}
            onStructure={editStructure}
          />
        )}

        {status === "loading" && mode === "matterport" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-foreground/40">
            <span className="inline-block h-2.5 w-2.5 animate-breathe rounded-full bg-background/70" />
          </div>
        )}

        {status === "error" && mode === "matterport" && (
          <div className="absolute inset-0 flex items-center justify-center bg-foreground px-8 text-center">
            <div className="max-w-md">
              <p className="text-lg font-medium">Tour unavailable</p>
              <p className="mt-3 text-sm text-background/60">{error}</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-8 rounded-full bg-background px-5 py-2.5 text-sm font-medium text-foreground"
              >
                Back to Discover
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const STEP_M = 0.25;

const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

/** The running total, itemized: every object and wall change you made, what each costs, and what is free. */
function CostLedger({ pieces, walls, wallEdits, total }: { pieces: StagedPiece[]; walls: NumberedWall[]; wallEdits: WallEdits; total: number }) {
  const [open, setOpen] = useState(true);
  const objects = pieces.map((piece) => ({
    key: piece.id,
    label: piece.product?.name ?? piece.custom?.name ?? piece.label.split(" · ")[0],
    amount: piece.price ?? 0,
  }));
  const removed = walls
    .filter((wall) => wallEdits.removed[wall.key] !== undefined && wall.role !== "added")
    .map((wall) => ({ key: wall.key, label: `Wall ${wall.number} taken down`, amount: removalPrice(wall) }));
  const added = walls
    .filter((wall) => wall.role === "added")
    .map((wall) => ({ key: wall.key, label: `New wall ${wall.number} (${wall.length.toFixed(1)} m)`, amount: additionPrice(wall.length) }));
  const listed = [...objects, ...removed, ...added].reduce((sum, row) => sum + row.amount, 0);
  const other = Math.round(total - listed);
  const groups = [
    { title: "Objects", rows: objects },
    { title: "Walls removed", rows: removed },
    { title: "Walls added", rows: added },
  ].filter((group) => group.rows.length);

  return (
    <aside className="absolute left-4 top-28 z-20 w-[15.5rem] overflow-hidden rounded-[1.25rem] bg-[#ece7dd] text-foreground shadow-[0_10px_30px_rgb(0_0_0/0.3)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span>
          <span className="block text-xs text-foreground/50">Running total</span>
          <span className="block text-lg font-medium tracking-tight tabular-nums">{usd(total)}</span>
        </span>
        <svg viewBox="0 0 24 24" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="max-h-[50vh] overflow-y-auto border-t border-foreground/10 px-4 pb-3 pt-2 text-sm">
          {groups.length === 0 && other <= 0 && <p className="py-1 text-foreground/50">No changes yet. Add objects or change walls and the cost of each shows here.</p>}
          {groups.map((group) => (
            <div key={group.title} className="mt-1.5">
              <p className="text-xs font-medium text-foreground/50">{group.title}</p>
              <ul className="mt-1 space-y-1">
                {group.rows.map((row) => (
                  <li key={row.key} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">{row.label}</span>
                    <span className="shrink-0 tabular-nums">{usd(row.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {other > 0 && (
            <div className="mt-1.5 flex items-baseline justify-between gap-3">
              <span className="text-foreground/70">Other room changes</span>
              <span className="tabular-nums">{usd(other)}</span>
            </div>
          )}
          <p className="mt-2.5 border-t border-foreground/10 pt-2 text-xs text-foreground/45">Moving and turning things is free.</p>
        </div>
      )}
    </aside>
  );
}

/** Arrow pad for the picked object, in either tour: slide it 25 cm at a time or turn it 45°. Moving is free. */
/** Arrow pad for the picked object or added wall, in either tour: slide 25 cm a click, turn, or remove it. */
function PieceControls({
  title,
  subtitle,
  google,
  onNudge,
  onTurn,
  onRemove,
  removeLabel = "Remove",
  onClose,
}: {
  title: string;
  subtitle: string;
  google?: string;
  onNudge?: (dx: number, dz: number) => void;
  onTurn?: () => void;
  onRemove: () => void;
  removeLabel?: string;
  onClose: () => void;
}) {
  const pad = "flex h-9 w-9 items-center justify-center rounded-full bg-background text-foreground transition-colors hover:bg-panel active:scale-95";
  return (
    <div className="absolute bottom-20 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-[1.4rem] bg-[#ece7dd] p-2 pl-4 text-foreground shadow-[0_10px_30px_rgb(0_0_0/0.3)]">
      <div className="min-w-0 max-w-[16rem]">
        <p className="truncate text-sm font-medium tracking-tight">{title}</p>
        <p className="truncate text-xs text-foreground/50">{subtitle}</p>
        <div className="mt-0.5 flex gap-3 text-xs">
          {google && (
            <a href={google} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
              See it on Google
            </a>
          )}
          <button type="button" onClick={onRemove} className="text-foreground/60 underline-offset-2 hover:text-accent hover:underline">
            {removeLabel}
          </button>
        </div>
      </div>
      {onNudge && onTurn && (
      <div className="grid grid-cols-3 gap-1" role="group" aria-label={`Move ${title}`}>
        <span />
        <button type="button" className={pad} aria-label="Move away" onClick={() => onNudge(0, -STEP_M)}>
          <Arrow rotate={0} />
        </button>
        <span />
        <button type="button" className={pad} aria-label="Move left" onClick={() => onNudge(-STEP_M, 0)}>
          <Arrow rotate={-90} />
        </button>
        <button type="button" className={pad} aria-label="Turn" onClick={onTurn}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M19 12a7 7 0 1 1-2.05-4.95M19 4.5V8h-3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button type="button" className={pad} aria-label="Move right" onClick={() => onNudge(STEP_M, 0)}>
          <Arrow rotate={90} />
        </button>
        <span />
        <button type="button" className={pad} aria-label="Move closer" onClick={() => onNudge(0, STEP_M)}>
          <Arrow rotate={180} />
        </button>
        <span />
      </div>
      )}
      <button type="button" onClick={onClose} aria-label="Done" className="self-start rounded-full p-1 text-foreground/40 hover:text-foreground">
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M2 2l10 10M12 2L2 12" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function Arrow({ rotate }: { rotate: number }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" style={{ transform: `rotate(${rotate}deg)` }} fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TourModeSwitch({ mode, onChange }: { mode: TourMode; onChange: (mode: TourMode) => void }) {
  return (
    <div className="absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center rounded-full bg-[#ece7dd] p-1 shadow-[0_10px_30px_rgb(0_0_0/0.28)]">
      <ModeButton
        selected={mode === "matterport"}
        onClick={() => onChange("matterport")}
        icon={<CubeIcon />}
        label="Matterport Tour"
      />
      <ModeButton selected={mode === "imagine"} onClick={() => onChange("imagine")} icon={<SparkIcon />} label="Imagine" />
    </div>
  );
}

function ModeButton({
  selected,
  onClick,
  icon,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium tracking-tight transition-colors ${
        selected ? "bg-background text-foreground shadow-[0_1px_2px_rgb(27_26_23/0.12)]" : "text-foreground/70 hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function CubeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M12 3.5 19 7.5v9L12 20.5 5 16.5v-9L12 3.5Z" strokeLinejoin="round" />
      <path d="M12 12.2 19 7.7M12 12.2 5 7.7M12 12.2v8.3" strokeLinejoin="round" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M12 4.5 13.2 9 17.5 10.2 13.2 11.4 12 16 10.8 11.4 6.5 10.2 10.8 9 12 4.5Z" strokeLinejoin="round" />
    </svg>
  );
}


function pointIn(points: { x: number; z: number }[], x: number, z: number) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z || 1e-9) + a.x) hit = !hit;
  }
  return hit;
}
