"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { GRID_M, ITEM_SPECS, type ItemType } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { useDeal } from "../deal-context";
import { ChecksCard } from "../layout/checks-card";
import { placementProblem } from "../layout/edit";
import { figuresOf, layoutImpact } from "../layout/impact";
import { ImpactBar } from "../layout/impact-bar";
import { Palette } from "../layout/palette";
import { Plan, type PlanHandle } from "../layout/plan-canvas";
import { PLAN_VARS } from "../layout/plan-vars";
import { useLayoutEditor } from "../use-layout";
import { ChapterFrame } from "./chapter-frame";
import type { ChapterProps } from "./types";

const NOOP = () => {};
const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
};

function Tool({ onClick, disabled, children, label, active }: { onClick: () => void; disabled?: boolean; children: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flow-label inline-flex h-9 items-center rounded-full border border-line px-3.5 text-text-2 outline-none transition-colors duration-150 hover:text-text focus-visible:ring-2 focus-visible:ring-live active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40",
        active && "border-live bg-live-wash text-text",
      )}
    >
      {children}
    </button>
  );
}

/** Chapter 3: the editable plan, a palette, the live impact bar, and what the plan triggers. */
export function LayoutChapter({ status, onRetry }: ChapterProps) {
  const deal = useDeal();
  const editor = useLayoutEditor();
  if (!deal || !editor) {
    return (
      <ChapterFrame
        step={3}
        title="Layout"
        lede="Make the plan yours. Drag tables, a bar or the cook line, and watch seats, cost and break-even move with them."
        will={[
          { what: "The plan, large, with a dot grid", source: "lib/layout" },
          { what: "Seats, all-in, break-even, year-3 profit", source: "layoutImpact" },
        ]}
        live={null}
        status={status}
        onRetry={onRetry}
      />
    );
  }
  return <Editor deal={deal} editor={editor} />;
}

function Editor({ deal, editor }: { deal: NonNullable<ReturnType<typeof useDeal>>; editor: NonNullable<ReturnType<typeof useLayoutEditor>> }) {
  const { layout, site, brief, impact, assessment, suggested } = deal;
  const plan = useRef<PlanHandle>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tilt, setTilt] = useState(false);
  const [checks, setChecks] = useState(false);
  const [preview, setPreview] = useState<{ id: string; problem: string } | null>(null);

  const now = useMemo(() => figuresOf(impact), [impact]);
  const base = useMemo(() => figuresOf(layoutImpact(site, brief, suggested)), [site, brief, suggested]);
  const flagged = useMemo(() => new Set(preview ? [preview.id] : []), [preview]);
  const selectedItem = selected ? layout.items.find((i) => i.id === selected) : undefined;
  const selId = selectedItem?.id ?? null;

  const { move, addAt, remove, rotate, undo, redo } = editor;
  const overPalette = (x: number, y: number) => !!document.elementFromPoint(x, y)?.closest("[data-palette]");

  const onPreview = useCallback(
    (id: string | null, x: number, y: number) => {
      const it = id ? layout.items.find((i) => i.id === id) : null;
      if (!id || !it) return setPreview(null);
      const problem = placementProblem(layout, { ...it, x, y });
      setPreview(problem ? { id, problem } : null);
    },
    [layout],
  );

  const onMove = useCallback(
    (id: string, x: number, y: number, cx: number, cy: number) => {
      setPreview(null);
      if (overPalette(cx, cy)) {
        remove(id);
        setSelected(null);
        return true;
      }
      return move(id, x, y);
    },
    [move, remove],
  );

  const onKey = useCallback(
    (id: string, e: KeyboardEvent) => {
      const step = e.shiftKey ? 1 : GRID_M;
      const it = layout.items.find((i) => i.id === id);
      const d = e.key === "ArrowLeft" ? [-step, 0] : e.key === "ArrowRight" ? [step, 0] : e.key === "ArrowUp" ? [0, -step] : e.key === "ArrowDown" ? [0, step] : null;
      if (!it || !d) return;
      e.preventDefault();
      move(id, it.x + d[0], it.y + d[1]);
    },
    [layout.items, move],
  );

  const dropAt = useCallback(
    (type: ItemType, cx: number, cy: number) => {
      const h = plan.current;
      if (!h || !h.contains(cx, cy)) return false;
      const [x, y] = h.toPlan(cx, cy);
      const ok = addAt(type, x, y);
      return ok;
    },
    [addAt],
  );

  // R turns, Delete removes, Ctrl+Z / Ctrl+Shift+Z undo and redo (not while typing in the composer)
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (typing(e.target)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        return e.shiftKey ? redo() : undo();
      }
      if (e.metaKey || e.ctrlKey || e.altKey || !selId) return;
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        rotate(selId);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        remove(selId);
        setSelected(null);
      } else if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selId, rotate, remove, undo, redo]);

  const notice = preview ? { text: preview.problem, tone: "needed" as const } : editor.notice;
  const worst = assessment.worst;

  return (
    <section aria-label="Layout" className="relative flex h-full min-h-0 flex-col gap-3 pt-11">
      <div className="pointer-events-auto flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="sr-only">Layout</h2>
          <p className="flow-source truncate text-text-3">
            {layout.items.length} pieces, {now.seats} seats, {layout.concept}. Drag to move, R to turn, Delete to remove. Type a change in the Guide.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {selectedItem ? (
            <>
              <Tool label={`Turn the ${ITEM_SPECS[selectedItem.type].label}`} onClick={() => rotate(selectedItem.id)}>
                Rotate
              </Tool>
              <Tool
                label={`Remove the ${ITEM_SPECS[selectedItem.type].label}`}
                onClick={() => {
                  remove(selectedItem.id);
                  setSelected(null);
                }}
              >
                Remove
              </Tool>
            </>
          ) : null}
          <Tool label="Undo" onClick={undo} disabled={!editor.canUndo}>
            Undo
          </Tool>
          <Tool label="Redo" onClick={redo} disabled={!editor.canRedo}>
            Redo
          </Tool>
          <Tool label="Reset to the suggested plan" onClick={editor.reset} disabled={layout === suggested}>
            Reset
          </Tool>
          <Tool label="Tilt the plan" onClick={() => setTilt((t) => !t)} active={tilt}>
            Tilt
          </Tool>
          <Tool label="What this triggers" onClick={() => setChecks((c) => !c)} active={checks}>
            <span className={cn("mr-1.5 inline-block size-2 rounded-full", worst === "likely-blocker" ? "bg-needed" : worst === "needs-professional" ? "bg-maybe" : "bg-saved")} aria-hidden />
            Checks {assessment.checks.length}
          </Tool>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        <Palette onAdd={editor.addAuto} onDropAt={dropAt} disabled={editor.busy} />
        <div className="pointer-events-auto relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-f-lg border border-line bg-stage-2/90 p-4" style={PLAN_VARS}>
          <Plan
            ref={plan}
            layout={layout}
            selectedId={selId}
            flagged={flagged}
            tilt={tilt}
            flight={editor.flight}
            sim={null}
            simPlaying={false}
            simSpeed={1}
            onSimTick={NOOP}
            onSelect={setSelected}
            onMove={onMove}
            onPreview={onPreview}
            onKey={onKey}
          />
          <p
            role="status"
            aria-live="polite"
            className={cn("pointer-events-none absolute inset-x-4 bottom-3 flow-source", notice?.tone === "needed" ? "text-needed" : "text-text-2")}
          >
            {editor.busy ? "Asking the planner" : (notice?.text ?? "")}
          </p>
        </div>
      </div>

      <ImpactBar now={now} suggested={base} budgetUsd={brief.budgetUsd} />
      <ChecksCard assessment={assessment} open={checks} onClose={() => setChecks(false)} />
    </section>
  );
}
