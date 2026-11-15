"use client";

import { useEffect, useMemo, useState } from "react";
import { PANO_DISCLAIMER } from "@/lib/immersive/imagine-types";
import { furnitureFor, roomRenderInstruction } from "@/lib/three-d/furniture-place";
import { useDeal } from "../deal-context";
import { Plan } from "../layout/plan-canvas";
import { PLAN_VARS } from "../layout/plan-vars";
import { MiniPlan } from "../room/mini-plan";
import { useLayoutEditor } from "../use-layout";
import { cn } from "@/lib/utils";
import { ChapterFrame } from "./chapter-frame";
import type { ChapterProps, RoomHooks } from "./types";

const pill =
  "flow-label pointer-events-auto inline-flex h-10 items-center rounded-full border border-line-strong bg-stage/80 px-4 text-text outline-none transition-colors duration-150 hover:text-text focus-visible:ring-2 focus-visible:ring-live active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40";
const NOFLAG = new Set<string>();
const NOOP = () => {};

/**
 * Chapter 4: the owner's plan standing in the 360 at true size. The stage behind this is the pano with real-scale
 * furniture (see pano-engine setFurniture); this draws the label, the mini-plan with its view cone, and the opt-in
 * AI render. Without a scan of this exact suite the plan cannot be placed in the 360, so it is shown as a plan view.
 */
export function RoomChapter({ status, onRetry, onChapter, room }: ChapterProps) {
  const deal = useDeal();
  const editor = useLayoutEditor();
  if (!deal || !editor) {
    return (
      <ChapterFrame
        step={4}
        title="Room"
        lede="See that it fits: your layout standing in the scanned room at true size."
        will={[
          { what: "Your furniture at real scale in the 360 scan", source: "lib/three-d layout map" },
          { what: "A mini plan with a view cone", source: "lib/layout" },
        ]}
        live={null}
        status={status}
        onRetry={onRetry}
      />
    );
  }
  return <Room deal={deal} editor={editor} room={room} onEdit={() => onChapter("layout")} />;
}

function Room({
  deal,
  editor,
  room,
  onEdit,
}: {
  deal: NonNullable<ReturnType<typeof useDeal>>;
  editor: NonNullable<ReturnType<typeof useLayoutEditor>>;
  room: RoomHooks;
  onEdit: () => void;
}) {
  const { site, layout } = deal;
  const input = useMemo(() => furnitureFor(site, layout), [site, layout]);
  const panos = site.matterport?.panos;
  const hasPanos = Boolean(panos?.some((p) => p.skybox?.length === 6));
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState({ pano: "", ids: "", empty: false });
  const { viewer } = room;

  // what the viewer shows now: which pano, how many of the plan's pieces are on stage, and whether it is de-furnished
  useEffect(() => {
    if (!input) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const v = viewer.current;
      const w = v?.where();
      if (!v || !w) return;
      const ids = v.furnitureIds().join(",");
      const empty = panos?.find((p) => p.id === w.panoId)?.skyboxEmpty?.length === 6;
      setView((o) => (o.pano === w.panoId && o.ids === ids && o.empty === Boolean(empty) ? o : { pano: w.panoId, ids, empty: Boolean(empty) }));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [input, viewer, panos]);

  if (!input || !hasPanos) {
    return (
      <section aria-label="Room" className="relative flex h-full min-h-0 flex-col gap-3 pt-[60px]">
        <p className="flow-source pointer-events-auto max-w-[64ch] text-text-2">
          {!hasPanos
            ? "This space has no 360 scan, so your plan is shown as a plan view."
            : "The scan here is not of this exact suite, so the plan cannot be placed inside it at true size. Shown as a plan view instead."}
        </p>
        <div className="pointer-events-auto min-h-0 flex-1 overflow-hidden rounded-f-lg border border-line bg-stage-2/90 p-4" style={PLAN_VARS}>
          <Plan
            layout={layout}
            selectedId={null}
            flagged={NOFLAG}
            tilt
            flight={0}
            sim={null}
            simPlaying={false}
            simSpeed={1}
            onSimTick={NOOP}
            onSelect={NOOP}
            onMove={() => false}
            onPreview={NOOP}
            onKey={NOOP}
          />
        </div>
        <div className="pointer-events-auto flex justify-end">
          <button type="button" onClick={onEdit} className={pill}>
            Edit layout
          </button>
        </div>
      </section>
    );
  }

  const inView = view.ids ? view.ids.split(",") : [];
  const pieces = layout.items.filter((i) => inView.includes(i.id));
  const canRender = !room.rendering && view.pano !== "";
  const render = () => {
    const text = roomRenderInstruction(layout.concept, pieces);
    room.render(text, `AI render of this view: ${pieces.length} pieces from my plan`);
  };

  return (
    <section aria-label="Room" className="relative flex h-full min-h-0 flex-col justify-between pt-[60px]">
      <div className="flex items-start justify-between gap-4">
        <p className="flow-source pointer-events-none max-w-[52ch] rounded-f-sm bg-stage/70 px-3 py-2 text-text-2">
          {room.rendered && !room.before
            ? `${PANO_DISCLAIMER}. An illustration of this view from your plan; the 3D pieces are hidden while it shows.`
            : `Furniture at true size, placed from your plan. Walls and finishes are the real scan.${view.empty ? "" : " This spot has no empty-room capture, so the scan still shows its original furniture."}`}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {room.rendered ? (
            <button type="button" aria-pressed={room.before} onClick={() => room.setBefore(!room.before)} className={cn(pill, room.before && "border-live bg-live-wash text-text")}>
              {room.before ? "Show AI render" : "Show 3D pieces"}
            </button>
          ) : null}
          <button type="button" onClick={render} disabled={!canRender} className={pill} title="Costs an image-model run, 20 to 60 seconds. Illustrative only.">
            {room.rendering ? <span className="flow-shimmer">Rendering this view</span> : "Render this view (AI)"}
          </button>
          <button type="button" onClick={onEdit} className={pill}>
            Edit layout
          </button>
        </div>
      </div>

      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p role="status" aria-live="polite" className={cn("flow-source pointer-events-none min-h-5 max-w-[300px] rounded-f-sm bg-stage/70 px-2 py-0.5", notice ? "text-needed" : "text-text-2")}>
            {notice ?? `${pieces.length} of ${layout.items.length} pieces stand in this view. Drag one to move it.`}
          </p>
          <MiniPlan layout={layout} frame={input.frame} editor={editor} room={room} onNotice={setNotice} />
        </div>
      </div>
    </section>
  );
}
