"use client";

import { animate, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { DUR, EASE_IN_OUT } from "@/components/site/motion-tokens";
import { DISCLAIMER } from "@/lib/imagine/types";
import { cn } from "@/lib/utils";

export type Layers = { scanned: string | null; empty: string | null; imagined: string | null };
type Layer = keyof Layers;

const NAMES: Record<Layer, string> = { scanned: "Scanned", empty: "Empty", imagined: "Imagined" };
const ALT: Record<Layer, string> = {
  scanned: "The room as scanned, furnished",
  empty: "The same view with furniture removed",
  imagined: "AI visualization of the imagined change, same view",
};

/**
 * Scanned / Empty / Imagined from one camera. The right side is the newest state there is (Imagined, else Empty);
 * the left side is the state it is compared with. Drag tracks the pointer 1:1; the three buttons and the keyboard
 * (arrows, Page keys, Home/End) do the same without dragging. When an imagined image first arrives the divider
 * sweeps across once to show it.
 */
export function CompareSlider({ layers, caption }: { layers: Layers; caption?: string }) {
  const right: Layer = layers.imagined ? "imagined" : layers.empty ? "empty" : "scanned";
  const lefts = (["scanned", "empty"] as const).filter((l) => l !== right && layers[l]);
  const [leftPick, setLeftPick] = useState<Layer>("empty");
  const left: Layer | null = lefts.includes(leftPick as "scanned" | "empty") ? leftPick : (lefts[lefts.length - 1] ?? null);
  const [pos, setPos] = useState(50);
  const [dragging, setDragging] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const revealed = useRef<string | null>(layers.imagined);

  // the one authored moment: the divider wipes from the right edge to the middle when a new image lands
  useEffect(() => {
    if (!layers.imagined || revealed.current === layers.imagined) return;
    revealed.current = layers.imagined;
    if (reduce) return;
    const controls = animate(100, 38, { duration: DUR.focal, ease: EASE_IN_OUT, onUpdate: setPos });
    return () => controls.stop();
  }, [layers.imagined, reduce]);

  const fromPointer = useCallback((clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (r) setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey || e.key.startsWith("Page") ? 10 : 2;
    const to =
      e.key === "ArrowLeft" || e.key === "ArrowDown" || e.key === "PageDown"
        ? pos - step
        : e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "PageUp"
          ? pos + step
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? 100
              : null;
    if (to === null) return;
    e.preventDefault();
    setPos(Math.max(0, Math.min(100, to)));
  };

  const show = (layer: Layer) => {
    if (layer === right) return setPos(0);
    setLeftPick(layer);
    setPos(100);
  };
  const shown: Layer | null = pos <= 1 ? right : pos >= 99 ? left : null;
  const rightSrc = layers[right];
  if (!rightSrc) return null;

  return (
    <figure className="m-0 flex flex-col gap-2">
      <div
        ref={box}
        className={cn("relative aspect-[4/3] touch-pan-y overflow-hidden rounded-sm border border-ink bg-paper-2 select-none", left ? (dragging ? "cursor-grabbing" : "cursor-ew-resize") : "")}
        onPointerDown={(e) => {
          if (e.button !== 0 || !left) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          fromPointer(e.clientX);
        }}
        onPointerMove={(e) => dragging && fromPointer(e.clientX)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      >
        <Image src={rightSrc} alt={ALT[right]} fill unoptimized sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" draggable={false} />
        {left && layers[left] ? (
          <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
            <Image src={layers[left]!} alt={ALT[left]} fill unoptimized sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" draggable={false} />
          </div>
        ) : null}
        {left ? <Tag className="left-2">{NAMES[left]}</Tag> : null}
        <Tag className="right-2">{NAMES[right]}</Tag>
        {right === "imagined" ? <p className="pointer-events-none absolute right-2 bottom-2 rounded-sm bg-ink/85 px-2 py-1 font-mono text-[0.6875rem] text-on-ink">{DISCLAIMER}</p> : null}

        {left ? (
          <>
            <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-paper" style={{ left: `${pos}%` }} aria-hidden>
              <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-ink/40" />
            </div>
            <div
              role="slider"
              tabIndex={0}
              aria-label={`Compare ${NAMES[left]} and ${NAMES[right]}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pos)}
              aria-valuetext={`${Math.round(pos)}% ${NAMES[left]}, ${100 - Math.round(pos)}% ${NAMES[right]}`}
              onKeyDown={onKey}
              className={cn(
                "absolute top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-paper bg-ink text-on-ink transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
                dragging ? "scale-95" : "[@media(hover:hover)_and_(pointer:fine)]:hover:scale-105",
              )}
              style={{ left: `${pos}%` }}
            >
              <svg viewBox="0 0 20 12" width="20" height="12" aria-hidden>
                <path d="M6 1 1 6l5 5M14 1l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </div>
          </>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div role="group" aria-label="Show one state" className="flex">
          {(["scanned", "empty", "imagined"] as const).map((l) => (
            <button
              key={l}
              type="button"
              disabled={!layers[l]}
              aria-pressed={shown === l}
              onClick={() => show(l)}
              className="-ml-px h-9 min-w-20 border border-rule-strong px-3 text-sm font-medium transition-[background-color,color,transform] duration-150 first:ml-0 first:rounded-l-sm last:rounded-r-sm hover:border-ink hover:z-10 active:scale-[0.97] disabled:pointer-events-none disabled:border-dashed disabled:text-ink-2/70 aria-pressed:z-10 aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-on-ink"
            >
              {NAMES[l]}
            </button>
          ))}
        </div>
        {caption ? <figcaption className="font-mono text-[0.6875rem] text-ink-2">src Matterport scan, {caption}</figcaption> : null}
      </div>
    </figure>
  );
}

function Tag({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={cn("pointer-events-none absolute top-2 rounded-sm bg-ink/85 px-2 py-1 text-xs font-medium text-on-ink", className)}>{children}</span>;
}
