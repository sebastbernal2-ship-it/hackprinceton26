"use client";

import { motion, useReducedMotion } from "motion/react";
import { Box, Calculator, LayoutGrid, Map as MapIcon, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import type { AerialData } from "@/components/site/aerial";
import { lineKey } from "@/components/site/focus-key";
import { focusFinding, requestWalk, useWalkRequest } from "@/components/site/focus-store";
import { Empty } from "@/components/site/primitives";
import { useImaginePano } from "@/components/immersive/use-imagine-pano";
import { Studio } from "@/components/studio/studio";
import { nearestPano, walkable, type WalkPano } from "@/lib/immersive/walk";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import type { OwnerBrief, SiteAnalysis } from "@/lib/engine/types";
import type { Layout, Op } from "@/lib/layout";
import type { Site } from "@/lib/sites/schema";
import { usd } from "@/lib/format";
import { loadVersions } from "@/lib/imagine/versions";
import { cn } from "@/lib/utils";
import { AboveView } from "./above-view";
import { ImaginedWalk } from "./imagined-walk";
import { CommandBar, type OtherSite } from "./command-bar";
import type { SurvivalOdds } from "./imagine-types";
import type { RentView } from "./rent-adapter";
import { MobileSheet, type Snap } from "./mobile-sheet";
import { SheetContent, type SheetSite } from "./sheet-content";
import { ImaginePanel } from "./slots.generated";
import { TopBar, type TopSite } from "./top-bar";
import { briefQuery, VIEW_LABEL, VIEWS, useWorkspaceState, type Compare, type UiState, type View } from "./url-state";
import { WalkView, type WalkPose, type WalkSite } from "./walk-view";
import type { Move } from "./walk-scene";


type Props = {
  site: TopSite;
  /** the slim site the browser needs (Plan view, Imagine) */
  planSite: Site;
  media: { src: string; caption: string }[];
  brief: OwnerBrief;
  analysis: SiteAnalysis;
  initialUi: UiState;
  walk: WalkSite | null;
  aerial: AerialData | null;
  sheetSite: SheetSite;
  survival: SurvivalOdds | null;
  rent?: RentView | null;
  others: OtherSite[];
  /** server-rendered Numbers plate (budget vessel, break-even, scenarios, lifeline, block trend) */
  numbers: ReactNode;
};

const VIEW_ICON: Record<View, typeof Box> = { walk: Box, plan: LayoutGrid, above: MapIcon, numbers: Calculator };
const subscribeWide = (cb: () => void) => {
  const m = window.matchMedia("(min-width: 1024px)");
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function Workspace(props: Props) {
  const { site, brief, analysis, walk, aerial, sheetSite, others } = props;
  const router = useRouter();
  const { ui, update, setBrief, briefPending } = useWorkspaceState(props.initialUi);
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia("(min-width: 1024px)").matches, () => true);
  const reduce = useReducedMotion();

  const [visited, setVisited] = useState<Set<View>>(() => new Set([props.initialUi.view]));
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [snap, setSnap] = useState<Snap>("peek");
  const [guideRequest, setGuideRequest] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [queued, setQueued] = useState<string | null>(null);
  const [layout, setLayout] = useState<Layout | undefined>(undefined);
  const [externalOps, setExternalOps] = useState<{ n: number; ops: Op[] } | undefined>(undefined);
  const [externalMoves, setExternalMoves] = useState<{ n: number; moves: Move[] } | undefined>(undefined);
  // the Walk fills this with a function that photographs the scan; Imagine calls it for its base picture
  const walkCapture = useRef<(() => Promise<string | null>) | null>(null);
  const getScreenshot = useCallback(async () => walkCapture.current?.() ?? null, []);
  // Imagined in the Walk: the immersive 360 walk, standing at the pano nearest the scan's camera (the scan is unmounted meanwhile)
  const poseRef = useRef<WalkPose>({});
  const imagine = useImaginePano(site.id);
  const { start: startPanoImagine } = imagine;
  const [immersiveAt, setImmersiveAt] = useState<string | null>(null);
  const panoSite = useMemo(() => (walk ? { id: site.id, address: site.address, matterport: { panos: walk.panos as unknown as WalkPano[], rooms: walk.rooms } } : null), [walk, site.id, site.address]);
  const firstPano = useMemo(() => walkable((panoSite?.matterport.panos ?? []) as WalkPano[])[0]?.id ?? null, [panoSite]);
  const nearestStart = useCallback((): string | null => {
    const panos = (panoSite?.matterport.panos ?? []) as WalkPano[];
    const pose = poseRef.current;
    const hit = pose.position ? nearestPano(panos, pose.position) : (walkable(panos).find((p) => p.id === pose.here) ?? null);
    return (hit ?? walkable(panos)[0])?.id ?? null;
  }, [panoSite]);
  const onImmersivePano = useCallback((id: string) => {
    poseRef.current = { here: id, sweep: id };
    setImmersiveAt(id);
  }, []);
  const sheetPanel = useRef<PanelImperativeHandle | null>(null);
  const briefButton = useRef<HTMLButtonElement>(null);
  const dockInput = useRef<HTMLInputElement>(null);
  const imagineHeading = useRef<HTMLHeadingElement>(null);

  const go = useCallback(
    (view: View) => {
      setVisited((s) => (s.has(view) ? s : new Set(s).add(view)));
      update({ view });
    },
    [update],
  );
  const openSheet = useCallback(
    (to: Snap = "half") => {
      if (wide) sheetPanel.current?.expand();
      else setSnap(to);
    },
    [wide],
  );
  const toggleSheet = useCallback(() => {
    const p = sheetPanel.current;
    if (!p) return;
    if (p.isCollapsed()) p.expand();
    else p.collapse();
  }, []);
  const startGuide = useCallback(() => {
    go("walk");
    update({ cmp: "scanned" });
    setGuideRequest((n) => n + 1);
  }, [go, update]);
  const showInWalk = useCallback(
    (findingId: string) => {
      go("walk");
      update({ cmp: "scanned" });
      if (!wide) setSnap("peek");
      requestWalk(findingId);
    },
    [go, update, wide],
  );
  // any "see it in the scan" (sheet, command bar, cost table in Numbers) brings the Walk forward
  const walkReq = useWalkRequest();
  const seenWalk = useRef(walkReq.n);
  useEffect(() => {
    if (walkReq.n === seenWalk.current) return;
    seenWalk.current = walkReq.n;
    go("walk");
    update({ cmp: "scanned" });
  }, [walkReq.n, go, update]);
  const openImagine = useCallback(
    (text?: string, run = false) => {
      if (text) setQueued(text);
      update({ tab: "imagine" });
      openSheet("full");
      // hand the dock's words to the Imagine panel's own field (its props take no prompt); it may still be loading
      let tries = 0;
      const fill = () => {
        const field = text ? document.querySelector<HTMLTextAreaElement>("#ws-sheet textarea") : null;
        if (field && text) {
          Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(field, text);
          field.dispatchEvent(new Event("input", { bubbles: true }));
          field.focus();
          // the dock's words are a request, not a draft: run them
          if (run) setTimeout(() => field.form?.requestSubmit(), 60);
        } else if (text && ImaginePanel && tries++ < 20) setTimeout(fill, 100);
        else imagineHeading.current?.focus();
      };
      requestAnimationFrame(fill);
    },
    [update, openSheet],
  );
  // the dock's change: the sheet runs the plan, checks and numbers; in the Walk the 360 walk imagines it too
  const submitDock = useCallback(
    (text: string) => {
      openImagine(text, true);
      const at = ui.view === "walk" ? nearestStart() : null;
      if (!at) return;
      setImmersiveAt(at);
      startPanoImagine(text, at, 1);
      update({ cmp: "imagined" });
    },
    [openImagine, ui.view, nearestStart, startPanoImagine, update],
  );
  const share = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      /* the Share button explains the fallback */
    }
  }, []);

  // keyboard: ⌘K anywhere; 1–4 views, \ sheet, W walk-through, I imagine when not typing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || paletteOpen || isTyping(e.target)) return;
      if (document.querySelector("[popover]:popover-open")) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 4) go(VIEWS[n - 1]);
      else if (e.key === "\\") toggleSheet();
      else if (e.key === "w" || e.key === "W") startGuide();
      else if (e.key === "i" || e.key === "I") {
        if (dockInput.current) dockInput.current.focus();
        else openImagine();
      }
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, toggleSheet, startGuide, openImagine, paletteOpen]);

  // the Walk's "Show my layout" needs the plan to exist: mount the Plan view (hidden) so it can produce one
  const wantLayout = useCallback(() => setVisited((v) => (v.has("plan") ? v : new Set(v).add("plan"))), []);
  const moveFromWalk = useCallback((moves: Move[]) => setExternalMoves((p) => ({ n: (p?.n ?? 0) + 1, moves })), []);
  const onLayoutOps = useCallback(
    (ops: Op[]) => {
      // an Imagine run started in the Walk stays in the Walk: the plan takes the ops in the background
      if (ui.view === "walk" && ui.cmp === "imagined") wantLayout();
      else go("plan");
      setExternalOps((p) => ({ n: (p?.n ?? 0) + 1, ops }));
    },
    [go, wantLayout, ui.view, ui.cmp],
  );

  // Imagine keeps its versions in localStorage per site (lib/imagine/versions.ts); any version unlocks "Imagined"
  const [stored, setStored] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStored(loadVersions(window.localStorage, site.id).length > 0);
    } catch {
      /* storage blocked */
    }
  }, [site.id, ui.tab, ui.view]);
  const hasVersion = Boolean(ui.v) || stored;
  // "Imagined" chosen (or a link to it) with nothing imagined in this visit yet: imagine the latest saved change here
  const wantsImagined = Boolean(walk) && ui.view === "walk" && ui.cmp === "imagined" && !imagine.version;
  useEffect(() => {
    if (!wantsImagined) return;
    try {
      const last = loadVersions(window.localStorage, site.id).at(-1);
      const at = immersiveAt ?? firstPano;
      if (last && at) startPanoImagine(last.instruction, at, 1);
    } catch {
      /* storage blocked */
    }
  }, [wantsImagined, site.id, immersiveAt, firstPano, startPanoImagine]);
  const canvas = (
    <main
      id="ws-canvas"
      aria-label="Site views"
      className="ws-canvas relative h-full min-h-0 overflow-hidden text-on-ink"
      onFocusCapture={() => {
        // keep focus visible: a phone's sheet steps down when focus moves onto the canvas
        if (!wide && snap !== "peek") setSnap("peek");
      }}
    >
      <ViewSwitcher view={ui.view} onView={go} />
      {ui.view === "walk" && walk ? <CompareControl value={ui.cmp} hasVersion={hasVersion} onChange={(cmp) => {
        // entering Imagined from the scan: stand at the pano nearest the camera
        if (cmp === "imagined" && ui.cmp !== "imagined") setImmersiveAt(nearestStart());
        update({ cmp });
      }} /> : null}
      {VIEWS.map((v, i) => {
        const active = ui.view === v;
        const dir = i < VIEWS.indexOf(ui.view) ? -1 : 1;
        return (
          <motion.div
            key={v}
            id={`ws-panel-${v}`}
            role="tabpanel"
            aria-labelledby={`ws-tab-${v}`}
            data-active={active}
            inert={!active}
            className="ws-layer absolute inset-0"
            initial={false}
            animate={active ? { opacity: 1, x: 0, visibility: "visible" } : { opacity: 0, x: dir * 24, transitionEnd: { visibility: "hidden" } }}
            transition={reduce ? { opacity: { duration: 0.15 }, x: { duration: 0 } } : { type: "spring", duration: 0.35, bounce: 0 }}
          >
            {visited.has(v) || active ? viewBody(v, active) : null}
          </motion.div>
        );
      })}

      <ImagineDock inputRef={dockInput} value={prompt} onChange={setPrompt} wide={wide} onSubmit={(t) => (submitDock(t), setPrompt(""))} onOpen={() => openImagine()} />
    </main>
  );

  function viewBody(view: View, active: boolean): ReactNode {
    if (view === "walk") {
      if (!walk) {
        return (
          <Stage>
            <Empty title="No 3D scan for this space" className="ws-plate max-w-md">
              The cost lines in the sheet come from the CoStar listing and tenant records only. Above and Numbers still have the rest.
            </Empty>
          </Stage>
        );
      }
      return <WalkView
          site={walk}
          mode={ui.cmp === "empty" ? "empty" : "scanned"}
          imaginedMode={ui.cmp === "imagined"}
          imagined={
            active && panoSite && (immersiveAt ?? firstPano) ? (
              <ImaginedWalk site={panoSite} startPano={(immersiveAt ?? firstPano)!} version={imagine.version} jobs={imagine.jobs} ensure={imagine.ensure} retry={imagine.retry} onPano={onImmersivePano} />
            ) : null
          }
          poseRef={poseRef}
          resumeAt={immersiveAt}
          active={active} guideRequest={guideRequest}
          captureRef={walkCapture}
          layout={layout}
          onLayoutMove={moveFromWalk}
          onWantLayout={wantLayout}
        />;
    }
    if (view === "plan") {
      return (
        <div className="ws-scroll absolute inset-0 overflow-auto">
          <div className="ws-stage">
            <div className="ws-plate mx-auto max-w-[80rem] p-4 sm:p-6">
              <Studio site={props.planSite} brief={brief} media={props.media} externalOps={externalOps} externalMoves={externalMoves} onLayoutChange={setLayout} />
            </div>
          </div>
        </div>
      );
    }
    if (view === "above") {
      return aerial ? (
        <AboveView aerial={aerial} address={site.address} />
      ) : (
        <Stage>
          <Empty title="Aerial imagery not prepared yet" className="ws-plate max-w-md">
            Parking, patio space and the building footprint appear here once the Vexcel image is cached.
          </Empty>
        </Stage>
      );
    }
    return (
      <div className="ws-scroll absolute inset-0 overflow-auto">
        <div className="ws-stage">
          <div className="ws-plate mx-auto max-w-[80rem] px-4 sm:px-8">{props.numbers}</div>
        </div>
      </div>
    );
  }

  const t = analysis.xray.total;
  const verdict = { comfortable: "comfortable", stretch: "a stretch", unlikely: "unlikely" }[analysis.breakeven.verdict];
  const sheetHeader = (
    <SheetHeader
      summary={
        wide ? null : (
          <p className="flex items-baseline gap-2 px-4 pb-2 text-sm">
            <span className="text-xs font-medium tracking-[0.06em] text-ink-2 uppercase">You pay</span>
            <span className="lettering text-xl leading-none font-bold">{`${usd(t.low)} – ${usd(t.high)}`}</span>
            <span className={cn("ml-auto text-sm font-semibold", analysis.breakeven.verdict === "unlikely" ? "text-needed" : analysis.breakeven.verdict === "stretch" ? "text-maybe-ink" : "text-saved")}>Break-even {verdict}</span>
          </p>
        )
      }
      tab={ui.tab}
      onTab={(tab) => update({ tab })}
      broker={ui.d === "broker"}
      onDensity={() => update({ d: ui.d === "broker" ? "owner" : "broker" })}
    />
  );
  const sheetBody =
    ui.tab === "read" ? (
      <SheetContent
        analysis={analysis}
        site={sheetSite}
        density={ui.d}
        survival={props.survival}
        rent={props.rent}
        onShowInWalk={showInWalk}
        onOpenNumbers={() => (go("numbers"), !wide && setSnap("peek"))}
      />
    ) : (
      <div className="px-4 py-5 sm:px-5" role="tabpanel" id="ws-sheet-imagine" aria-labelledby="ws-sheet-tab-imagine">
        <h2 ref={imagineHeading} tabIndex={-1} className={cn("lettering text-xl font-semibold outline-none", ImaginePanel && "sr-only")}>
          Imagine a change
        </h2>
        {ImaginePanel ? (
          <div>
            <ImaginePanel site={props.planSite} brief={brief} layout={layout} onLayoutOps={onLayoutOps} getScreenshot={getScreenshot} />
          </div>
        ) : (
          <ImaginePlaceholder queued={queued} />
        )}
      </div>
    );

  return (
    <div className="ws flex h-dvh flex-col overflow-hidden">
      <a href="#ws-sheet" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:bg-paper focus:px-3 focus:py-2 focus:text-ink">
        Skip to the numbers
      </a>
      <TopBar
        site={site}
        brief={brief}
        briefPending={briefPending}
        onBrief={setBrief}
        onCommand={() => setPaletteOpen(true)}
        sheetOpen={sheetOpen}
        onToggleSheet={toggleSheet}
        briefRef={briefButton}
      />

      {wide ? (
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          <ResizablePanel id="ws-canvas-panel" minSize="40%">
            {canvas}
          </ResizablePanel>
          <ResizableHandle
            aria-label="Resize the sheet"
            className="relative z-10 w-px bg-ink after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2 hover:bg-[oklch(0.78_0.12_245)] focus-visible:bg-[oklch(0.78_0.12_245)] data-[separator=active]:bg-[oklch(0.78_0.12_245)]"
          />
          <ResizablePanel
            id="ws-sheet-panel"
            panelRef={sheetPanel}
            defaultSize={432}
            minSize={340}
            maxSize="55%"
            collapsible
            collapsedSize={0}
            onResize={(s) => setSheetOpen(s.inPixels > 1)}
          >
            <aside id="ws-sheet" aria-label="Site sheet" className="flex h-full flex-col bg-paper text-ink">
              {sheetHeader}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" tabIndex={0} aria-label="Sheet content">
                {sheetBody}
              </div>
            </aside>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <>
          <div className="min-h-0 flex-1">{canvas}</div>
          <div aria-hidden className="h-[var(--ws-peek)] shrink-0" />
          <MobileSheet snap={snap} onSnap={setSnap} header={sheetHeader} label="Site sheet">
            {sheetBody}
          </MobileSheet>
        </>
      )}

      <CommandBar
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        brief={brief}
        lines={analysis.xray.lines}
        walkable={sheetSite.walkable}
        sites={others}
        broker={ui.d === "broker"}
        onView={go}
        onFinding={(l, inWalk) => {
          if (inWalk && l.findingId) showInWalk(l.findingId);
          else {
            go("numbers");
            focusFinding(lineKey(l));
          }
        }}
        onBrief={setBrief}
        onEditBrief={() => (wide ? briefButton.current?.click() : document.getElementById("ws-brief")?.showPopover())}
        onSite={(id) => router.push(`/site/${id}?${briefQuery(brief)}`)}
        onGuide={startGuide}
        onImagine={() => (dockInput.current ? dockInput.current.focus() : openImagine())}
        onShare={share}
        onOffer={() => router.push(`/site/${site.id}/offer?${briefQuery(brief)}`)}
        onDensity={() => {
          update({ d: ui.d === "broker" ? "owner" : "broker", tab: "read" });
          openSheet("full");
        }}
      />
    </div>
  );
}

function Stage({ children }: { children: ReactNode }) {
  return <div className="ws-stage absolute inset-0 flex items-center justify-center text-ink">{children}</div>;
}

/** Same place on every site, keyboard 1–4. A tablist: arrows move between views. */
function ViewSwitcher({ view, onView }: { view: View; onView: (v: View) => void }) {
  const reduce = useReducedMotion();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div role="tablist" aria-label="Views" className="ws-seg ws-slot-tl absolute z-20 grid grid-cols-4 lg:inline-flex">
      {VIEWS.map((v, i) => {
        const Icon = VIEW_ICON[v];
        const selected = v === view;
        return (
          <button
            key={v}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`ws-tab-${v}`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={`ws-panel-${v}`}
            aria-keyshortcuts={String(i + 1)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onView(v)}
            onKeyDown={(e) => {
              const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (!d) return;
              e.preventDefault();
              const next = (i + d + VIEWS.length) % VIEWS.length;
              onView(VIEWS[next]);
              refs.current[next]?.focus();
            }}
            className="ws-seg-item max-lg:min-h-11"
          >
            {selected ? <motion.span layoutId="ws-view-mark" className="ws-seg-mark" transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.3, bounce: 0 }} /> : null}
            <Icon className="size-4" aria-hidden />
            <span>{VIEW_LABEL[v].name}</span>
            <kbd aria-hidden className="hidden font-mono text-[0.6875rem] opacity-60 xl:inline">
              {i + 1}
            </kbd>
          </button>
        );
      })}
    </div>
  );
}

const COMPARE_LABEL: Record<Compare, string> = { scanned: "Scanned", empty: "Empty", imagined: "Imagined" };

/** One compare control: the room as scanned, emptied of furniture, or as imagined (once a version exists). */
function CompareControl({ value, hasVersion, onChange }: { value: Compare; hasVersion: boolean; onChange: (c: Compare) => void }) {
  const reduce = useReducedMotion();
  return (
    <div role="radiogroup" aria-label="Compare the room" className="ws-seg ws-slot-tr absolute z-20">
      {(Object.keys(COMPARE_LABEL) as Compare[]).map((c) => {
        const disabled = c === "imagined" && !hasVersion;
        const checked = value === c;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-disabled={disabled || undefined}
            title={disabled ? "Imagine a change first: each one becomes a version you can compare" : undefined}
            onClick={() => !disabled && onChange(c)}
            className="ws-seg-item"
          >
            {checked ? <motion.span layoutId="ws-compare-mark" className="ws-seg-mark" transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.3, bounce: 0 }} /> : null}
            <span>{COMPARE_LABEL[c]}</span>
          </button>
        );
      })}
    </div>
  );
}

const DOCK_CHIPS = ["Open the kitchen to the room", "Add a patio", "Turn it into a coffee bar"];

/** The reserved "Imagine a change…" dock at the bottom of the canvas. On a phone it is one button into the sheet. */
function ImagineDock({
  inputRef,
  value,
  onChange,
  onSubmit,
  onOpen,
  wide,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (v: string) => void;
  onSubmit: (text: string) => void;
  onOpen: () => void;
  wide: boolean;
}) {
  if (!wide) {
    return (
      <div className="absolute inset-x-0 bottom-[var(--ws-gap)] z-20 flex justify-center">
        <button type="button" onClick={onOpen} className="ws-chip ws-chip-solid">
          <Sparkles className="size-4" aria-hidden /> Imagine a change…
        </button>
      </div>
    );
  }
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim().length > 1) onSubmit(value.trim());
  };
  return (
    <form onSubmit={submit} role="search" aria-label="Imagine a change" className="absolute inset-x-0 bottom-[var(--ws-gap)] z-20 mx-auto flex w-[min(34rem,calc(100%-2rem))] flex-col gap-1.5">
      <div className="ws-float flex items-center gap-2 rounded-sm border border-on-ink/25 p-1.5 pl-3 transition-colors focus-within:border-on-ink/70">
        <Sparkles className="size-4 shrink-0 text-on-ink-2" aria-hidden />
        <label htmlFor="ws-imagine" className="sr-only">
          Imagine a change
        </label>
        <input
          ref={inputRef}
          id="ws-imagine"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={300}
          autoComplete="off"
          placeholder="Imagine a change… open the kitchen, add a patio"
          aria-keyshortcuts="I"
          className="h-9 min-w-0 flex-1 bg-transparent text-[0.9375rem] text-on-ink outline-none placeholder:text-on-ink-2/80"
        />
        <button type="submit" disabled={value.trim().length < 2} className="h-9 shrink-0 rounded-sm bg-paper px-3 text-sm font-semibold text-ink transition-[transform,background-color] duration-150 hover:bg-paper-2 active:scale-[0.97] disabled:opacity-50">
          Imagine
        </button>
      </div>
      <div className="flex justify-center gap-1.5">
        {DOCK_CHIPS.map((c) => (
          <button key={c} type="button" onClick={() => onSubmit(c)} className="ws-chip ws-chip-sm">
            {c}
          </button>
        ))}
      </div>
    </form>
  );
}

function SheetHeader({ summary, tab, onTab, broker, onDensity }: { summary: ReactNode; tab: "read" | "imagine"; onTab: (t: "read" | "imagine") => void; broker: boolean; onDensity: () => void }) {
  return (
    <>
    {summary}
    <div className="flex h-12 shrink-0 items-stretch justify-between gap-2 border-b border-ink px-2 sm:px-3">
      <div role="tablist" aria-label="Sheet" className="flex items-stretch">
        {(["read", "imagine"] as const).map((t) => (
          <button
            key={t}
            id={`ws-sheet-tab-${t}`}
            role="tab"
            type="button"
            aria-selected={tab === t}
            aria-controls={t === "imagine" ? "ws-sheet-imagine" : undefined}
            onClick={() => onTab(t)}
            className={cn(
              "relative flex min-w-11 items-center gap-1.5 px-2.5 text-sm font-medium transition-colors",
              tab === t ? "text-ink after:absolute after:inset-x-2.5 after:bottom-[-1px] after:h-0.5 after:bg-ink" : "text-ink-2 hover:text-ink",
            )}
          >
            {t === "imagine" ? <Sparkles className="size-3.5" aria-hidden /> : null}
            {t === "read" ? "This site" : "Imagine"}
          </button>
        ))}
      </div>
      {tab === "read" ? (
        <button type="button" role="switch" aria-checked={broker} onClick={onDensity} className="my-auto inline-flex h-11 items-center gap-2 px-1 text-sm text-ink-2 hover:text-ink sm:h-9">
          <span aria-hidden className={cn("relative inline-block h-4 w-7 rounded-full border transition-colors", broker ? "border-ink bg-ink" : "border-rule-strong bg-paper-2")}>
            <span className="absolute top-[2px] left-[2px] size-2.5 rounded-full transition-transform duration-150" style={{ transform: broker ? "translateX(12px)" : "none", background: broker ? "var(--paper)" : "var(--ink-2)" }} />
          </span>
          Broker view
        </button>
      ) : null}
    </div>
    </>
  );
}

function ImaginePlaceholder({ queued }: { queued: string | null }) {
  return (
    <div className="mt-3 flex flex-col gap-3">
      {queued ? (
        <p className="rounded-sm border border-ink px-3 py-2 text-sm">
          <span className="font-semibold">Your change: </span>“{queued}”
        </p>
      ) : null}
      <div role="status" className="rounded-sm border border-dashed border-rule-strong bg-paper-2/60 p-4">
        <p className="font-medium">Imagine is being connected</p>
        <p className="mt-1 text-sm text-ink-2">
          Each change you describe becomes a version of this room: a picture of the change made in the real scan, the checks it triggers (hood, grease, walls, permits) and what it adds to the cost. Versions then appear under Compare as “Imagined”.
        </p>
      </div>
      <p className="text-xs text-ink-2">AI views are visualizations, not construction drawings. A wall is never shown as removable without an engineer flag.</p>
    </div>
  );
}
