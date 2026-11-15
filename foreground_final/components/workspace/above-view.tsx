"use client";

import Image from "next/image";
import { useState } from "react";
import { layerOf, LAYER_STYLE, type AerialData } from "@/components/site/aerial";
import { monthYear, num, sf } from "@/lib/format";
import { cn } from "@/lib/utils";

type Layer = keyof typeof LAYER_STYLE;

/** The Above view: the Vexcel ortho full-bleed with its detection overlays, or the oblique for the street face. */
export function AboveView({ aerial, address }: { aerial: AerialData; address: string }) {
  const [angle, setAngle] = useState<"ortho" | "oblique">("ortho");
  const present = (Object.keys(LAYER_STYLE) as Layer[]).filter((k) => aerial.detections.some((d) => layerOf(d.label) === k));
  const [layers, setLayers] = useState<Layer[]>(present);
  const w = aerial.widthPx ?? 1000;
  const h = aerial.heightPx ?? 1000;
  const barM = aerial.extentM > 150 ? 50 : 20;
  const oblique = angle === "oblique" && aerial.obliquePath;

  const facts = [
    ["Vehicles seen", aerial.vehicleCount != null ? num(aerial.vehicleCount) : null],
    ["Footprint", aerial.footprintSf != null ? sf(aerial.footprintSf) : null],
    ["Parking areas", aerial.parkingSpaces != null ? num(aerial.parkingSpaces) : null],
    ["Patio candidate", aerial.patioCandidateSf ? sf(aerial.patioCandidateSf) : null],
  ].filter((f): f is [string, string] => f[1] !== null);

  return (
    <div className="ws-stage absolute inset-0 flex items-center justify-center [container-type:size]">
      {oblique ? (
        <div className="relative h-full w-full">
          <Image src={aerial.obliquePath!} alt={`Angled aerial view of ${address} and its street`} fill sizes="(min-width: 1024px) 70vw, 100vw" className="object-contain" />
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-sm border border-on-ink/15" style={{ aspectRatio: `${w} / ${h}`, width: `min(100cqw, 100cqh * ${w / h})` }}>
          <Image src={aerial.orthoPath} alt={`Aerial view looking straight down at ${address} and its lot`} fill sizes="(min-width: 1024px) 70vw, 100vw" className="object-cover" />
          <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
            {aerial.detections.map((d, i) => {
              const layer = layerOf(d.label);
              if (!layers.includes(layer)) return null;
              const s = LAYER_STYLE[layer];
              return <polygon key={i} points={d.polygon.map(([x, y]) => `${x},${y}`).join(" ")} fill={s.fill} stroke={s.stroke} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />;
            })}
          </svg>
          {/* the parcel's survey monument */}
          <span aria-hidden className="absolute top-1/2 left-1/2 size-6 -translate-x-1/2 -translate-y-1/2">
            <span className="absolute inset-x-0 top-1/2 h-px bg-on-ink" />
            <span className="absolute inset-y-0 left-1/2 w-px bg-on-ink" />
          </span>
          <div className="absolute bottom-2 left-2 text-[0.6875rem] font-medium text-on-ink [text-shadow:0_1px_2px_rgb(0_0_0/0.8)]" style={{ width: `${(barM / aerial.extentM) * 100}%` }}>
            <div className="h-1.5 border-x-2 border-b-2 border-on-ink" />
            <span className="sr-only">Scale: </span>
            {barM} m
          </div>
        </div>
      )}

      {/* angle switch, top right (where Walk keeps its compare control) */}
      {aerial.obliquePath ? (
        <div role="radiogroup" aria-label="Camera angle" className="ws-seg ws-slot-tr absolute">
          {(["ortho", "oblique"] as const).map((a) => (
            <button key={a} type="button" role="radio" aria-checked={angle === a} onClick={() => setAngle(a)} className="ws-seg-item">
              {angle === a ? <span aria-hidden className="ws-seg-mark" /> : null}
              <span>{a === "ortho" ? "Straight down" : "Angled"}</span>
            </button>
          ))}
        </div>
      ) : null}

      {/* layers and facts, bottom left */}
      <div className="ws-slot-bl absolute flex max-w-[calc(100%-1.5rem)] flex-col gap-2">
        {!oblique && present.length ? (
          <div role="group" aria-label="Overlay layers" className="flex flex-wrap gap-1.5">
            {present.map((k) => {
              const on = layers.includes(k);
              return (
                <button key={k} type="button" aria-pressed={on} onClick={() => setLayers((l) => (on ? l.filter((x) => x !== k) : [...l, k]))} className={cn("ws-chip", on && "ws-chip-on")}>
                  <span aria-hidden className="inline-block size-2.5 rounded-[2px] border border-on-ink/40" style={{ background: LAYER_STYLE[k].stroke }} />
                  {LAYER_STYLE[k].name}
                </button>
              );
            })}
          </div>
        ) : null}
        {facts.length ? (
          <dl className="ws-float flex gap-4 overflow-x-auto rounded-sm border border-on-ink/15 px-3 py-2 [scrollbar-width:none]">
            {facts.map(([label, value]) => (
              <div key={label} className="shrink-0">
                <dt className="text-[0.6875rem] font-medium tracking-[0.06em] text-on-ink-2 uppercase">{label}</dt>
                <dd className="lettering text-lg leading-tight font-semibold text-on-ink">{value}</dd>
              </div>
            ))}
            <div className="shrink-0 self-end">
              <dt className="sr-only">Source</dt>
              <dd className="font-mono text-[0.6875rem] text-on-ink-2">src Vexcel{aerial.captureDate ? `, ${monthYear(aerial.captureDate)}` : ""}</dd>
            </div>
          </dl>
        ) : null}
      </div>
    </div>
  );
}
