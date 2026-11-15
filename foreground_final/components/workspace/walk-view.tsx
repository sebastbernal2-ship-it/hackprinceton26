"use client";

import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Armchair, ChevronLeft, ChevronRight, Footprints, Map as MapIcon, Move3d, RotateCcw, RotateCw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { focusFinding, linkProps, useFocusedFinding, useWalkRequest } from "@/components/site/focus-store";
import { spreadColocated, TAG_COLOR, TONE_TEXT, type TourPin, type Vec3 } from "@/components/site/matterport-tour";
import { SPRING } from "@/components/site/motion-tokens";
import { Empty } from "@/components/site/primitives";
import { XRayLens, type LensCallout, type LensPair } from "@/components/site/xray-lens";
import { ITEM_SPECS, type Layout, type Pt } from "@/lib/layout";
import { planFrameFor, sceneItems } from "@/lib/three-d/layout-map";
import { cn } from "@/lib/utils";
import { LayoutObjects, mountViewer, type Move, type Sdk } from "./walk-scene";

/**
 * The Walk view: the Matterport scan full-bleed (the Matterport Web Component, so the scan itself can be defurnished,
 * annotated and photographed) with cost pins placed in it, a minimap inset that shows where the camera is, "Walk me
 * through it": a guided route that visits the costly findings in order with a caption each, and the owner's layout
 * standing in the room as 3D furniture they can drag.
 */
export type WalkStep = {
  /** finding id: the focus key shared with the cost line in the sheet */
  id: string;
  label: string;
  /** "You pay $40k – $80k" */
  cost: string;
  tone: TourPin["tone"];
  detail: string;
  panoId?: string;
  image?: string;
};

type Room = { label: string; polygon?: [number, number][] };

/** Everything the Walk needs about one site, prepared on the server. */
export type WalkSite = {
  modelId: string;
  sdkKey: string | null;
  title: string;
  pins: TourPin[];
  panos: Pano[];
  rooms: Room[];
  steps: WalkStep[];
  /** "this suite" / "neighbouring suite" provenance for the minimap */
  scanNote: string;
  /** furniture-removed stills for the Empty mode: the fallback when the scan has no defurnished view */
  lens: { pairs: LensPair[]; callouts: LensCallout[] } | null;
};

export type WalkLayoutProps = {
  /** the plan as the owner last left it in the Plan view; undefined until the Plan has produced one */
  layout?: Layout;
  /** a drag in the scan, as plan metres and a quarter-turn rotation, to write back to the layout */
  onLayoutMove?: (moves: Move[]) => void;
  /** the owner turned "Show my layout" on: make sure a layout exists */
  onWantLayout?: () => void;
};

/** Scene-capture hook for the Imagine panel: filled with a function that photographs the current view. */
export type WalkCapture = RefObject<(() => Promise<string | null>) | null>;

/** Where the Matterport camera is (scene space, y-up) and the pano it last stood on; kept across the immersive walk. */
export type WalkPose = { position?: Vec3; sweep?: string; here?: string };

export function WalkView({
  site,
  mode,
  active,
  guideRequest,
  onScreenshot,
  captureRef,
  layout,
  onLayoutMove,
  onWantLayout,
  imagined,
  imaginedMode,
  resumeAt,
  poseRef,
}: {
  site: WalkSite;
  mode: "scanned" | "empty";
  /** receives every screenshot the Walk takes (Renderer.takeScreenShot, as a data URL) */
  onScreenshot?: (dataUrl: string) => void;
  active: boolean;
  guideRequest: number;
  captureRef?: WalkCapture;
  /** the immersive imagined walk: while it is up the scan is unmounted, so only one WebGL context is alive */
  imagined?: ReactNode;
  /** Compare is on Imagined: the scan stays unmounted (also while the Walk is not on screen, when `imagined` is null) */
  imaginedMode?: boolean;
  /** the pano the immersive walk ended on: the scan opens there when it comes back */
  resumeAt?: string | null;
  poseRef?: RefObject<WalkPose>;
} & WalkLayoutProps) {
  const [inPlace, setInPlace] = useState<boolean | null>(null);
  // stills only when the scan has no defurnished view to switch to (or the viewer is not running)
  const stills = mode === "empty" && inPlace === false;
  if (imaginedMode) return <>{imagined}</>;
  return (
    <>
      <LiveWalk {...site} mode={mode} active={active && !stills} guideRequest={guideRequest} onInPlace={setInPlace} onScreenshot={onScreenshot} captureRef={captureRef} layout={layout} onLayoutMove={onLayoutMove} onWantLayout={onWantLayout} poseRef={poseRef} resumeAt={resumeAt} />
      {stills ? (
        <div className="absolute inset-0 z-10 overflow-auto bg-[var(--canvas)]">
          <div className="ws-stage flex min-h-full items-start justify-center">
            <div className="ws-plate w-full max-w-4xl p-3 sm:p-5">
              {site.lens && site.lens.pairs.some((p) => p.after) ? (
                <XRayLens pairs={site.lens.pairs} callouts={site.lens.callouts} />
              ) : (
                <Empty title="No furniture-removed views yet">This scan has no empty-room stills. Scanned shows the room as found.</Empty>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
type Pano = { id: string; position: Vec3 };

/**
 * Matterport's own dispose rejects once while it unloads its modules ("No Data was registered to the Module",
 * "IToolsModule module unloaded"): nothing of ours is wrong and nothing can catch it, so for the few seconds a
 * teardown takes, those two messages (and only those) are kept out of the console and the dev overlay.
 */
function muteViewerTeardown() {
  const known = /No Data was registered to the Module|module unloaded/;
  const onRejection = (e: PromiseRejectionEvent) => {
    if (known.test(String((e.reason as Error | undefined)?.message ?? e.reason))) e.preventDefault();
  };
  const onError = (e: ErrorEvent) => {
    if (known.test(e.message)) e.preventDefault();
  };
  window.addEventListener("unhandledrejection", onRejection);
  window.addEventListener("error", onError);
  setTimeout(() => {
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("error", onError);
  }, 5000);
}
type Status = "connecting" | "live" | "tour-only";

const TONE_DOT: Record<TourPin["tone"], string> = {
  needed: "bg-needed text-needed",
  saved: "bg-saved text-saved",
  maybe: "bg-maybe text-maybe",
  info: "bg-on-ink-2 text-on-ink-2",
};
const TONE_INK: Record<TourPin["tone"], string> = {
  needed: "text-[oklch(0.72_0.16_29)]",
  saved: "text-[oklch(0.75_0.12_155)]",
  maybe: "text-maybe",
  info: "text-on-ink-2",
};

/** Room outlines are z-up (x, y forward); the Web Component is y-up (verified against the scan): {x, y: z, z: -y}. */
const toScene = (p: Vec3): Vec3 => ({ x: p.x, y: p.z, z: -p.y });

const VIEW_DEFURNISH = "viewtype.defurnish";
const VIEW_SCANNED = "viewtype.layeredbase";

function LiveWalk({
  modelId,
  sdkKey,
  title,
  pins,
  panos,
  rooms,
  steps,
  mode,
  active,
  guideRequest,
  onGuideChange,
  scanNote,
  onInPlace,
  onScreenshot,
  captureRef,
  layout,
  onLayoutMove,
  onWantLayout,
  poseRef,
  resumeAt,
}: {
  modelId: string;
  sdkKey: string | null;
  title: string;
  pins: TourPin[];
  panos: Pano[];
  rooms: Room[];
  steps: WalkStep[];
  mode: "scanned" | "empty";
  /** the Walk view is the one on screen */
  active: boolean;
  /** bumps to start the guided route from outside (command bar, sheet) */
  guideRequest: number;
  onGuideChange?: (running: boolean) => void;
  scanNote: string;
  /** whether Empty can be shown in the scan itself (null until the viewer has reported its views) */
  onInPlace: (ok: boolean | null) => void;
  onScreenshot?: (dataUrl: string) => void;
  captureRef?: WalkCapture;
  poseRef?: RefObject<WalkPose>;
  resumeAt?: string | null;
} & WalkLayoutProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sdkRef = useRef<Sdk | null>(null);
  const viewsRef = useRef<Map<string, Sdk>>(new Map());
  const roomBoxes = useRef<{ min: Vec3; max: Vec3 }[]>([]);
  const objects = useRef<LayoutObjects | null>(null);
  const onScreenshotRef = useRef(onScreenshot);
  const onMoveRef = useRef(onLayoutMove);
  useEffect(() => {
    onScreenshotRef.current = onScreenshot;
    onMoveRef.current = onLayoutMove;
  });
  const [status, setStatus] = useState<Status>(sdkKey ? "connecting" : "tour-only");
  const [tagIds, setTagIds] = useState<Record<string, string>>({});
  // coming back from the immersive walk, the scan opens where that walk ended
  const resumeRef = useRef(resumeAt ?? null);
  const [here, setHere] = useState<string | null>(resumeAt && panos.some((p) => p.id === resumeAt) ? resumeAt : (panos[0]?.id ?? null));
  const [frameKey, setFrameKey] = useState(0);
  const [guide, setGuide] = useState<number | null>(null);
  const [mapOpen, setMapOpen] = useState(true);
  const [viewsReady, setViewsReady] = useState(0);
  const [showLayout, setShowLayout] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [gizmo, setGizmo] = useState<"translate" | "rotate">("translate");
  const reduce = useReducedMotion();
  const focused = useFocusedFinding();

  const rings = useMemo(() => rooms.filter((r) => r.polygon && r.polygon.length >= 3).map((r) => r.polygon as Pt[]), [rooms]);
  // the plan only matches the scan when it is of this very suite
  const layoutOk = scanNote === "this suite" && rings.length > 0;
  const frame = useMemo(() => (layoutOk ? planFrameFor(rings) : null), [layoutOk, rings]);
  const fallbackSrc = useMemo(() => {
    const params = new URLSearchParams({ m: modelId, play: "1", qs: "1", help: "0", title: "0", brand: "0" });
    if (sdkKey) params.set("applicationKey", sdkKey);
    return `https://my.matterport.com/show?${params.toString()}`;
  }, [modelId, sdkKey]);

  // narrow screens start with the map folded so the scan has the room
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.matchMedia("(max-width: 1023px)").matches) setMapOpen(false);
  }, []);

  // mount the Web Component, place one tag per finding with a position, learn the scan's views and rooms
  useEffect(() => {
    if (!sdkKey || !hostRef.current) return;
    let cancelled = false;
    const abort = new AbortController();
    const subs: { cancel(): void }[] = [];
    const host = hostRef.current;
    let viewer: HTMLElement | null = null;
    viewsRef.current = new Map();
    (async () => {
      try {
        const mounted = await mountViewer(host, { modelId, sdkKey, signal: abort.signal });
        viewer = mounted.el;
        const sdk = mounted.sdk;
        if (cancelled) return;
        sdkRef.current = sdk;
        if (process.env.NODE_ENV !== "production") (window as unknown as { __walk?: unknown }).__walk = { sdk, views: () => viewsRef.current, objects: () => objects.current };
        setStatus("live");
        const back = resumeRef.current;
        if (back) {
          resumeRef.current = null;
          await sdk.Sweep.moveTo(back, { transition: sdk.Sweep.Transition?.INSTANT }).catch(() => undefined);
        }

        subs.push(
          sdk.View.views.subscribe({
            onCollectionUpdated(c: Record<string, Sdk>) {
              viewsRef.current = new Map(Object.values(c).map((v) => [v.type as string, v]));
              onInPlace(viewsRef.current.has(VIEW_DEFURNISH));
              setViewsReady((n) => n + 1);
            },
          }),
        );
        subs.push(
          sdk.Room.data.subscribe({
            onCollectionUpdated(c: Record<string, Sdk>) {
              roomBoxes.current = Object.values(c).map((r) => ({ min: { ...r.bounds.min }, max: { ...r.bounds.max } }));
            },
          }),
        );
        subs.push(
          sdk.Camera.pose.subscribe((pose: { sweep?: string; position?: Vec3 }) => {
            const known = pose.sweep && panos.some((p) => p.id === pose.sweep) ? pose.sweep : undefined;
            if (poseRef) poseRef.current = { position: pose.position ? { ...pose.position } : poseRef.current.position, sweep: known ?? poseRef.current.sweep, here: known ?? poseRef.current.here };
            if (known) setHere((h) => (h === known ? h : known));
          }),
        );

        const placeable = pins.filter((p) => p.position);
        if (placeable.length) {
          const spread = spreadColocated(placeable.map((p) => p.position!));
          const ids: string[] = await sdk.Tag.add(
            ...placeable.map((p, i) => ({
              label: p.label,
              description: `${TONE_TEXT[p.tone]}. ${p.detail}`,
              anchorPosition: toScene(spread[i]),
              stemVector: { x: 0, y: 0.4, z: 0 },
              color: TAG_COLOR[p.tone],
            })),
          ).catch(() => [] as string[]);
          if (!cancelled) setTagIds(Object.fromEntries(placeable.flatMap((p, i) => (ids[i] ? [[p.id, ids[i]]] : []))));
        }
      } catch {
        // no Web Component (key, network, domain): fall back to the plain tour
        if (!cancelled) {
          setStatus("tour-only");
          onInPlace(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      muteViewerTeardown();
      abort.abort();
      subs.forEach((s) => s.cancel());
      objects.current?.dispose();
      objects.current = null;
      sdkRef.current = null;
      viewer?.remove();
    };
  }, [modelId, sdkKey, pins, panos, frameKey, onInPlace, poseRef]);

  // Scanned / Empty: switch the scan's view in place
  useEffect(() => {
    if (status !== "live") return;
    const v = viewsRef.current.get(mode === "empty" ? VIEW_DEFURNISH : VIEW_SCANNED);
    if (v && !v.active) void v.setActive(false).catch(() => undefined);
  }, [mode, status, viewsReady]);

  // the Imagine panel's screenshot of the current view (the SDK's string is normalised by toJpegDataUrl)
  const capture = useCallback(async (): Promise<string | null> => {
    const sdk = sdkRef.current;
    if (!sdk) return null;
    try {
      const raw: string = await sdk.Renderer.takeScreenShot({ width: 1280, height: 720 }, { mattertags: false, sweeps: false, measurements: false, views: false });
      const data = toJpegDataUrl(raw);
      if (!data) return null;
      onScreenshotRef.current?.(data);
      return data;
    } catch {
      return null;
    }
  }, []);
  useEffect(() => {
    if (!captureRef) return;
    captureRef.current = status === "live" ? capture : null;
    return () => {
      captureRef.current = null;
    };
  }, [captureRef, capture, status]);

  // the layout as 3D furniture
  const items = useMemo(() => (layout ? sceneItems(layout) : []), [layout]);
  useEffect(() => {
    if (status !== "live" || !showLayout || !frame || !items.length) return;
    const sdk = sdkRef.current!;
    if (!objects.current) {
      const lowest = () => Math.min(...panos.map((p) => p.position.z - 1.4), 0);
      objects.current = new LayoutObjects(sdk, frame, () => roomBoxes.current, lowest);
    }
    void objects.current.sync(items);
  }, [status, showLayout, frame, items, panos]);
  useEffect(() => {
    if (showLayout) return;
    objects.current?.dispose();
    objects.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(null);
  }, [showLayout]);
  useEffect(() => {
    objects.current?.select(selected, gizmo);
  }, [selected, gizmo, items]);

  // click an object to select it; after any drag, write the new placement back
  useEffect(() => {
    const host = hostRef.current;
    if (status !== "live" || !showLayout || !host) return;
    let down: { x: number; y: number; t: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      const o = objects.current;
      if (!o) return;
      if (selected) {
        // a gizmo drag ends here: let the control apply its last move, then read it
        setTimeout(() => {
          const move = objects.current?.readSelected();
          if (move) onMoveRef.current?.([move]);
        }, 80);
      }
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || performance.now() - d.t > 600) return;
      const r = host.getBoundingClientRect();
      void sdkRef.current?.Renderer.getWorldPositionData({ x: e.clientX - r.left, y: e.clientY - r.top })
        .then((hit: { position: Vec3 | null }) => {
          if (!hit?.position) return;
          const id = o.pick(hit.position);
          if (id) setSelected(id);
        })
        .catch(() => undefined);
    };
    host.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    return () => {
      host.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
    };
  }, [status, showLayout, selected]);

  const toggleLayout = () => {
    if (!showLayout) onWantLayout?.();
    setShowLayout(!showLayout);
  };

  const goTo = useCallback(
    async (findingId: string, panoId?: string) => {
      if (panoId) setHere(panoId);
      const sdk = sdkRef.current;
      if (!sdk) return;
      const transition = reduce ? sdk.Sweep.Transition?.INSTANT : sdk.Sweep.Transition?.FLY;
      if (panoId) await sdk.Sweep.moveTo(panoId, { transition }).catch(() => undefined);
      const tag = tagIds[findingId];
      if (tag) await sdk.Tag.open(tag).catch(() => undefined);
    },
    [tagIds, reduce],
  );

  const reset = useCallback(() => {
    setGuide(null);
    focusFinding(null);
    const sdk = sdkRef.current;
    const start = panos[0]?.id;
    if (sdk && start) {
      setHere(start);
      void sdk.Sweep.moveTo(start, { transition: sdk.Sweep.Transition?.FLY }).catch(() => undefined);
    } else {
      // tour-only: reload the scan at its start position
      setFrameKey((k) => k + 1);
      setHere(start ?? null);
    }
  }, [panos]);

  // guided route
  const startGuide = useCallback(() => steps.length && setGuide(0), [steps.length]);
  const lastGuideRequest = useRef(guideRequest);
  useEffect(() => {
    if (guideRequest === lastGuideRequest.current) return;
    lastGuideRequest.current = guideRequest;
    startGuide();
  }, [guideRequest, startGuide]);
  useEffect(() => {
    onGuideChange?.(guide !== null);
    if (guide === null) return;
    const s = steps[guide];
    focusFinding(s.id);
    // goTo drives the scan (and records where the camera went)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void goTo(s.id, s.panoId);
  }, [guide, steps, goTo, onGuideChange]);

  // a "Show in 3D" from the sheet or the command bar
  const walk = useWalkRequest();
  const lastWalk = useRef(0); // 0, not walk.n: a request made just before the Walk first mounts still lands
  useEffect(() => {
    if (walk.n === lastWalk.current || !walk.finding) return;
    lastWalk.current = walk.n;
    const pin = pins.find((p) => p.id === walk.finding);
    focusFinding(walk.finding);
    void goTo(walk.finding, pin?.panoId);
  }, [walk.n, walk.finding, pins, goTo]);

  // keyboard for the route: arrows step, Escape leaves (only while the Walk view is on screen)
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (guide === null) {
        if (e.key === "Escape" && selected) setSelected(null);
        else return;
      } else if (e.key === "ArrowRight") setGuide((g) => (g === null ? g : Math.min(steps.length - 1, g + 1)));
      else if (e.key === "ArrowLeft") setGuide((g) => (g === null ? g : Math.max(0, g - 1)));
      else if (e.key === "Escape") {
        setGuide(null);
        focusFinding(null);
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [guide, active, steps.length, selected]);

  const step = guide !== null ? steps[guide] : null;
  const placed = Object.keys(tagIds).length;
  const picked = selected && layout ? layout.items.find((i) => i.id === selected) : null;
  const layoutNote = !showLayout ? null : !layout ? "Loading your layout…" : items.length === 0 ? "No furniture in your layout yet" : picked ? null : `${items.length} pieces from your plan. Click one to move it`;

  return (
    <div className="absolute inset-0">
      {status === "tour-only" ? (
        <iframe key={frameKey} src={fallbackSrc} title={title} allow="fullscreen; xr-spatial-tracking" className="absolute inset-0 h-full w-full border-0" />
      ) : (
        <div ref={hostRef} role="application" aria-label={title} className="absolute inset-0 overflow-hidden" />
      )}

      {/* tools, top right under the compare control */}
      <div className="ws-slot-tr2 pointer-events-none absolute flex flex-col items-end gap-2">
        <div className="pointer-events-auto flex flex-col items-end gap-1.5 lg:flex-row">
          {status === "live" && layoutOk ? (
            <button type="button" onClick={toggleLayout} aria-pressed={showLayout} className={cn("ws-chip", showLayout && "ws-chip-solid")}>
              <Armchair className="size-4" aria-hidden />
              Show my layout
            </button>
          ) : null}
          <button type="button" onClick={guide === null ? startGuide : () => (setGuide(null), focusFinding(null))} disabled={!steps.length} className="ws-chip">
            {guide === null ? <Footprints className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />}
            {guide === null ? "Walk me through it" : "End walk-through"}
          </button>
          <button type="button" onClick={reset} className="ws-chip" title="Back to the entrance">
            <RotateCcw className="size-4" aria-hidden />
            Reset view
          </button>
        </div>
        {picked ? (
          <div className="pointer-events-auto ws-float flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs text-on-ink" role="group" aria-label={`${ITEM_SPECS[picked.type].label} selected`}>
            <span className="mr-1 font-semibold">{ITEM_SPECS[picked.type].label}</span>
            <button type="button" className={cn("ws-chip", gizmo === "translate" && "ws-chip-solid")} aria-pressed={gizmo === "translate"} onClick={() => setGizmo("translate")}>
              <Move3d className="size-4" aria-hidden />
              Move
            </button>
            <button type="button" className={cn("ws-chip", gizmo === "rotate" && "ws-chip-solid")} aria-pressed={gizmo === "rotate"} onClick={() => setGizmo("rotate")}>
              <RotateCw className="size-4" aria-hidden />
              Turn
            </button>
            <button type="button" className="ws-chip" onClick={() => setSelected(null)} aria-label="Done moving">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ) : null}
        <p role="status" aria-live="polite" className="ws-float max-lg:sr-only flex items-center gap-2 rounded-sm px-2 py-1 text-xs text-on-ink-2">
          <span aria-hidden className={cn("inline-block size-2 rounded-full", status === "live" ? "bg-saved" : status === "connecting" ? "bg-maybe motion-safe:animate-pulse" : "bg-on-ink-2/60")} />
          {layoutNote ?? (status === "live" ? (placed ? `${placed} cost pins in the scan` : "Scan connected") : status === "connecting" ? "Placing cost pins…" : "Tour only: pins are listed in the sheet")}
        </p>
      </div>

      {/* minimap: where you are, and where the findings are */}
      <Minimap open={mapOpen} onToggle={() => setMapOpen((o) => !o)} rooms={rooms} panos={panos} pins={pins} here={here} focused={focused} onPin={(p) => (focusFinding(p.id), void goTo(p.id, p.panoId))} note={scanNote} />

      {/* the guided route's caption, above the dock */}
      <AnimatePresence>
        {step ? (
          <motion.section
            key="guide"
            aria-label="Walk-through"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
            transition={SPRING.settle}
            className="ws-guide ws-float absolute inset-x-3 z-10 mx-auto max-w-[34rem] rounded-sm border border-on-ink/15 p-3 text-on-ink sm:inset-x-4"
          >
            <div className="flex items-start gap-3">
              {step.image ? (
                <span className="relative hidden h-16 w-24 shrink-0 overflow-hidden rounded-sm border border-on-ink/20 sm:block">
                  <Image src={step.image} alt="" fill sizes="96px" className="object-cover" />
                </span>
              ) : null}
              <div className="min-w-0 flex-1" aria-live="polite">
                <p className="font-mono text-[0.6875rem] text-on-ink-2">
                  Stop {guide! + 1} of {steps.length}
                </p>
                <p className="lettering mt-0.5 text-lg leading-tight font-semibold">{step.label}</p>
                <p className={cn("text-sm font-semibold", TONE_INK[step.tone])}>{step.cost}</p>
                <p className="mt-0.5 line-clamp-2 text-sm text-on-ink-2">{step.detail}</p>
                {status !== "live" ? <p className="mt-1 text-xs text-on-ink-2">The tour cannot be steered here; the photo shows where this was seen.</p> : null}
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <button type="button" className="ws-chip" onClick={() => setGuide((g) => Math.max(0, (g ?? 0) - 1))} disabled={guide === 0} aria-label="Previous stop">
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              {guide! < steps.length - 1 ? (
                <button type="button" className="ws-chip ws-chip-solid" onClick={() => setGuide((g) => Math.min(steps.length - 1, (g ?? 0) + 1))}>
                  Next stop <ChevronRight className="size-4" aria-hidden />
                </button>
              ) : (
                <button type="button" className="ws-chip ws-chip-solid" onClick={() => (setGuide(null), focusFinding(null))}>
                  Finish
                </button>
              )}
              <span className="ml-auto hidden font-mono text-[0.6875rem] text-on-ink-2 sm:inline">← → to step · Esc to leave</span>
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Minimap({
  open,
  onToggle,
  rooms,
  panos,
  pins,
  here,
  focused,
  onPin,
  note,
}: {
  open: boolean;
  onToggle: () => void;
  rooms: Room[];
  panos: Pano[];
  pins: TourPin[];
  here: string | null;
  focused: string | null;
  onPin: (p: TourPin) => void;
  note: string;
}) {
  const shapes = rooms.filter((r) => r.polygon && r.polygon.length >= 3).map((r) => r.polygon!);
  const pts = [...shapes.flat(), ...panos.map((p) => [p.position.x, p.position.y] as [number, number])];
  const placed = pins.filter((p) => p.position);
  if (pts.length < 2) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const pad = 1;
  const minX = Math.min(...xs) - pad;
  const maxY = Math.max(...ys) + pad;
  const w = Math.max(...xs) + pad - minX;
  const h = maxY - (Math.min(...ys) - pad);
  // model space is z-up with y forward: flip y so forward is up on the map
  const X = (x: number) => x - minX;
  const Y = (y: number) => maxY - y;
  const hereP = panos.find((p) => p.id === here);
  const pct = (x: number, y: number) => ({ left: `${(X(x) / w) * 100}%`, top: `${(Y(y) / h) * 100}%` });

  return (
    <div className="ws-slot-tl2 absolute z-10">
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls="ws-minimap" className="ws-chip mb-1.5">
        <MapIcon className="size-4" aria-hidden />
        {open ? "Hide map" : "Map"}
      </button>
      {open ? (
        <figure id="ws-minimap" className="ws-float m-0 w-40 rounded-sm border border-on-ink/15 p-2 lg:w-56" aria-label="Floor map of the scan">
          <div className="relative" style={{ aspectRatio: `${w} / ${h}`, maxHeight: "11rem" }}>
            <svg viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 h-full w-full" aria-hidden>
              {shapes.map((poly, i) => (
                <polygon key={i} points={poly.map(([x, y]) => `${X(x)},${Y(y)}`).join(" ")} fill="oklch(0.97 0.006 230 / 0.06)" stroke="oklch(0.97 0.006 230 / 0.55)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ))}
              {panos.map((p) => (
                <circle key={p.id} cx={X(p.position.x)} cy={Y(p.position.y)} r={0.18} fill="oklch(0.97 0.006 230 / 0.35)" />
              ))}
            </svg>
            {hereP ? (
              <motion.span
                aria-hidden
                className="absolute -translate-x-1/2 -translate-y-1/2"
                animate={pct(hereP.position.x, hereP.position.y)}
                initial={false}
                transition={SPRING.settle}
              >
                <span className="block size-3 rounded-full border-2 border-on-ink bg-[oklch(0.52_0.16_250)]" />
              </motion.span>
            ) : null}
            {placed.map((p) => (
              <button
                key={p.id}
                type="button"
                {...linkProps(p.id)}
                onClick={() => onPin(p)}
                aria-label={`${p.label}: ${TONE_TEXT[p.tone]}. Show in the scan`}
                className="group absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
                style={pct(p.position!.x, p.position!.y)}
              >
                <span data-active={focused === p.id} className={cn("ping block size-2.5 rounded-full ring-2 ring-ink transition-transform duration-150 group-hover:scale-125", TONE_DOT[p.tone])} />
              </button>
            ))}
          </div>
          <figcaption className="mt-1.5 flex flex-col gap-0.5 text-[0.6875rem] text-on-ink-2">
            <span className="inline-flex items-center gap-1">
              <span aria-hidden className="inline-block size-2 rounded-full border border-on-ink bg-[oklch(0.52_0.16_250)]" /> You are here
            </span>
            <span className="truncate font-mono">src Matterport · {note}</span>
          </figcaption>
        </figure>
      ) : null}
    </div>
  );
}

/**
 * Renderer.takeScreenShot's string varies (bare base64, "image/jpg", line breaks). The Imagine route accepts only
 * data:image/(png|jpeg|webp);base64,... so normalise here; null when it isn't image data at all.
 */
export function toJpegDataUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const m = /^data:image\/([a-z]+);base64,(.*)$/s.exec(raw.trim());
  const type = m ? (m[1] === "jpg" ? "jpeg" : m[1]) : "jpeg";
  const body = (m ? m[2] : raw).replace(/\s+/g, "");
  if (!/^(png|jpeg|webp)$/.test(type) || !/^[A-Za-z0-9+/=]+$/.test(body)) return null;
  return `data:image/${type};base64,${body}`;
}
