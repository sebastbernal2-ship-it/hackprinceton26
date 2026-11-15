"use client";

import { useRef, useState, type PointerEvent } from "react";
import { ITEM_SPECS, ITEM_TYPES, type ItemType } from "@/lib/layout";
import { cn } from "@/lib/utils";

const ORDER: ItemType[] = ["two-top", "four-top", "six-top", "booth", "bar-counter", "bar-stool", "kitchen-line", "prep", "walk-in", "counter", "host", "restroom", "patio-table"];
const ITEMS = ORDER.filter((t) => ITEM_TYPES.includes(t));

/**
 * The item palette: every type lib/layout supports, each showing its seats and footprint. Click adds the piece
 * where the engine finds a free spot in its own zone; dragging a chip onto the plan drops it exactly there. A piece
 * dragged back onto the palette is removed (the root carries `data-palette`).
 */
export function Palette({
  onAdd,
  onDropAt,
  disabled,
}: {
  onAdd: (type: ItemType) => void;
  /** a drag ended at this screen point; return whether the plan took it */
  onDropAt: (type: ItemType, clientX: number, clientY: number) => boolean;
  disabled?: boolean;
}) {
  const [ghost, setGhost] = useState<{ type: ItemType; x: number; y: number; back: boolean } | null>(null);
  const drag = useRef<{ type: ItemType; sx: number; sy: number; moved: boolean } | null>(null);

  const down = (type: ItemType) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { type, sx: e.clientX, sy: e.clientY, moved: false };
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6) return;
    d.moved = true;
    setGhost({ type: d.type, x: e.clientX, y: e.clientY, back: false });
  };
  const up = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d.moved) return onAdd(d.type);
    const took = onDropAt(d.type, e.clientX, e.clientY);
    if (took) return setGhost(null);
    // refused: the ghost slides back to its chip
    const chip = e.currentTarget.getBoundingClientRect();
    setGhost({ type: d.type, x: chip.left + chip.width / 2, y: chip.top + chip.height / 2, back: true });
    window.setTimeout(() => setGhost(null), 260);
  };

  return (
    <div data-palette className="pointer-events-auto flex h-full w-[104px] shrink-0 flex-col gap-1.5 overflow-y-auto rounded-f-lg border border-line bg-stage/70 p-2" role="toolbar" aria-label="Add to the plan">
      <p className="flow-source px-1 pb-0.5 text-text-3">Add (seats)</p>
      {ITEMS.map((type) => {
        const spec = ITEM_SPECS[type];
        return (
          <button
            key={type}
            type="button"
            disabled={disabled}
            onPointerDown={down(type)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => {
              drag.current = null;
              setGhost(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onAdd(type);
              }
            }}
            aria-label={`Add ${spec.label}${spec.seats ? `, ${spec.seats} seats` : ""}`}
            className="group flex min-h-8 touch-none items-center justify-between gap-1 rounded-f-sm border border-line bg-glass-fill px-2 py-1 text-left outline-none transition-colors duration-150 hover:border-line-strong hover:bg-live-wash focus-visible:ring-2 focus-visible:ring-live active:scale-[0.97] disabled:opacity-50"
          >
            <span className="text-[0.75rem] font-medium leading-tight text-text">{spec.label}</span>
            {spec.seats ? <span className="flow-source text-text-3" aria-hidden>{spec.seats}</span> : null}
          </button>
        );
      })}
      {ghost ? (
        <div
          aria-hidden
          className={cn("pointer-events-none fixed left-0 top-0 z-50 rounded-f-sm border border-live bg-stage-3 px-2 py-1 text-[0.75rem] font-medium text-text", ghost.back && "transition-transform duration-200")}
          style={{ transform: `translate(${ghost.x - 40}px, ${ghost.y - 16}px)` }}
        >
          {ITEM_SPECS[ghost.type].label}
        </div>
      ) : null}
    </div>
  );
}
