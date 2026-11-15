"use client";

import Image from "next/image";
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type BeforeAfterPair = { panoId: string; before: string; after: string | null; caption?: string };

/**
 * Furnished (as scanned) vs empty (defurnished) from the same camera.
 * Pointer: tracks 1:1 from pointer-down with capture. Keyboard: arrows, Page keys, Home/End.
 */
export function BeforeAfter({ pairs }: { pairs: BeforeAfterPair[] }) {
  const [index, setIndex] = useState(0);
  const pair = pairs[index];

  return (
    <div className="flex flex-col gap-3">
      {pair.after ? <Slider key={pair.panoId} pair={pair as Required<BeforeAfterPair> & { after: string }} /> : <Single pair={pair} />}
      {pair.caption ? <p className="text-sm text-ink-2">{pair.caption}</p> : null}
      {pairs.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Camera position">
          {pairs.map((p, i) => (
            <button
              key={p.panoId}
              type="button"
              aria-pressed={i === index}
              onClick={() => setIndex(i)}
              className={cn(
                "relative h-14 w-20 overflow-hidden rounded-sm border transition-[border-color,transform] active:scale-[0.97]",
                i === index ? "border-2 border-ink" : "border-rule-strong hover:border-ink",
              )}
            >
              <Image src={p.after ?? p.before} alt={`View ${i + 1}`} fill sizes="80px" className="object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Single({ pair }: { pair: BeforeAfterPair }) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-sm border border-ink bg-paper-2">
      <Image src={pair.before} alt="The space as scanned, furnished" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
      <Tag side="left">Furnished, as scanned</Tag>
      <p className="absolute right-2 bottom-2 rounded-sm bg-paper/90 px-2 py-1 text-xs">No empty view for this angle yet</p>
    </div>
  );
}

function Slider({ pair }: { pair: { before: string; after: string } }) {
  const [pos, setPos] = useState(50);
  const [dragging, setDragging] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const fromPointer = useCallback((clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey || e.key.startsWith("Page") ? 10 : 2;
    const move =
      e.key === "ArrowLeft" || e.key === "ArrowDown" || e.key === "PageDown"
        ? (p: number) => p - step
        : e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "PageUp"
          ? (p: number) => p + step
          : e.key === "Home"
            ? () => 0
            : e.key === "End"
              ? () => 100
              : null;
    if (!move) return;
    e.preventDefault();
    setPos((p) => Math.max(0, Math.min(100, move(p))));
  };

  return (
    <div
      ref={box}
      className={cn(
        "relative aspect-[4/3] touch-pan-y overflow-hidden rounded-sm border border-ink bg-paper-2 select-none",
        dragging ? "cursor-grabbing" : "cursor-ew-resize",
      )}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        fromPointer(e.clientX);
      }}
      onPointerMove={(e) => dragging && fromPointer(e.clientX)}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
    >
      {/* after (empty) underneath, before (furnished) clipped on top: left side shows furnished */}
      <Image src={pair.after} alt="The same view with furniture removed" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" draggable={false} />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <Image src={pair.before} alt="The space as scanned, furnished" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" draggable={false} />
      </div>
      <Tag side="left">Furnished, as scanned</Tag>
      <Tag side="right">Empty, furniture removed</Tag>

      <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-paper" style={{ left: `${pos}%` }} aria-hidden>
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-ink/40" />
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Compare furnished and empty"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        aria-valuetext={`${Math.round(pos)}% furnished view shown`}
        onKeyDown={onKey}
        className={cn(
          "absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-paper bg-ink text-on-ink transition-transform",
          dragging ? "scale-95" : "hover:scale-105",
        )}
        style={{ left: `${pos}%` }}
      >
        <svg viewBox="0 0 20 12" width="20" height="12" aria-hidden>
          <path d="M6 1 1 6l5 5M14 1l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </div>
    </div>
  );
}

function Tag({ side, children }: { side: "left" | "right"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute top-2 rounded-sm bg-ink/85 px-2 py-1 text-xs font-medium text-on-ink",
        side === "left" ? "left-2" : "right-2",
      )}
    >
      {children}
    </span>
  );
}
