"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Layout } from "@/lib/layout";
import { GRID_M } from "@/lib/layout";
import type { FurnitureInput } from "@/lib/three-d/furniture-place";
import { placementProblem } from "../layout/edit";
import { Plan } from "../layout/plan-canvas";
import { PLAN_VARS } from "../layout/plan-vars";
import type { LayoutEditor } from "../use-layout";
import type { RoomHooks } from "../chapters/types";

const NOFLAG = new Set<string>();
const NOOP = () => {};
/** the view cone, in plan metres: apex at the camera, pointing up the plan (yaw 0) */
const CONE_LEN = 2.6;
const CONE_HALF = Math.tan((38 * Math.PI) / 180) * CONE_LEN;

/**
 * The Room's 300 x 220 plan: the owner's layout, a dot where the camera stands and a cone for where it looks.
 * Dragging a piece moves it in the 360 on every pointer move (through `onDrag`) and commits through the same layout
 * editor as the Layout chapter on release, so Layout, Numbers and Deal read the same plan.
 */
export function MiniPlan({
  layout,
  frame,
  editor,
  room,
  onNotice,
}: {
  layout: Layout;
  frame: FurnitureInput["frame"];
  editor: LayoutEditor;
  room: Pick<RoomHooks, "viewer" | "onDrag">;
  onNotice: (n: string | null) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const cone = useRef<SVGGElement>(null);
  const { move } = editor;
  const { viewer, onDrag } = room;

  // the cone follows the view: written straight to the DOM every frame it changes, no React render
  useEffect(() => {
    let raf = 0;
    let last = "";
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const w = viewer.current?.where();
      if (!w || !cone.current) return;
      const [px, py] = frame.toPlan({ x: w.x, y: w.y });
      const t = `translate(${px} ${py}) rotate(${(-w.yaw * 180) / Math.PI})`;
      if (t === last) return;
      last = t;
      cone.current.setAttribute("transform", t);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [viewer, frame]);

  const overlay = useMemo(
    () => (
      <g ref={cone} pointerEvents="none" aria-hidden>
        <path d={`M0 0 L${-CONE_HALF} ${-CONE_LEN} Q0 ${-CONE_LEN - 0.5} ${CONE_HALF} ${-CONE_LEN} Z`} fill="var(--ring)" fillOpacity={0.32} stroke="var(--ring)" strokeOpacity={0.7} strokeWidth={0.05} />
        <circle r={0.28} fill="var(--ring)" stroke="var(--ink)" strokeWidth={0.07} />
      </g>
    ),
    [],
  );

  const onPreview = (id: string | null, x: number, y: number) => {
    const it = id ? layout.items.find((i) => i.id === id) : null;
    if (!id || !it) {
      onDrag(null);
      onNotice(null);
      return;
    }
    onDrag({ id, x, y });
    onNotice(placementProblem(layout, { ...it, x, y }));
  };

  const onKey = (id: string, e: KeyboardEvent) => {
    const step = e.shiftKey ? 1 : GRID_M;
    const it = layout.items.find((i) => i.id === id);
    const d = e.key === "ArrowLeft" ? [-step, 0] : e.key === "ArrowRight" ? [step, 0] : e.key === "ArrowUp" ? [0, -step] : e.key === "ArrowDown" ? [0, step] : null;
    if (!it || !d) return;
    e.preventDefault();
    move(id, it.x + d[0], it.y + d[1]);
  };

  return (
    <div className="pointer-events-auto h-[220px] w-[300px] shrink-0 overflow-hidden rounded-f-lg border border-line bg-stage/85 p-2" style={PLAN_VARS}>
      <Plan
        layout={layout}
        selectedId={selected}
        flagged={NOFLAG}
        tilt={false}
        flight={0}
        sim={null}
        simPlaying={false}
        simSpeed={1}
        onSimTick={NOOP}
        onSelect={setSelected}
        onMove={(id, x, y) => {
          onDrag(null);
          return move(id, x, y);
        }}
        onPreview={onPreview}
        onKey={onKey}
        overlay={overlay}
      />
    </div>
  );
}
