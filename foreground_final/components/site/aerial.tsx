"use client";

import Image from "next/image";
import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { monthYear, num, sf } from "@/lib/format";
import { Fact, Src } from "./primitives";

type Detection = { label: string; confidence: number; polygon: [number, number][] };

export type AerialData = {
  orthoPath: string;
  obliquePath?: string | null;
  captureDate: string | null;
  extentM: number;
  /** pixel size of the ortho image; detection polygons are in these pixels */
  widthPx?: number;
  heightPx?: number;
  footprintSf?: number | null;
  vehicleCount?: number | null;
  parkingSpaces?: number | null;
  hardscapeSf?: number | null;
  patioCandidateSf?: number | null;
  detections: Detection[];
};

/** Detection label â†’ layer. Unknown labels go to "other". */
export function layerOf(label: string): "parking" | "patio" | "building" | "other" {
  const l = label.toLowerCase();
  if (/(park|vehicle|car|lot)/.test(l)) return "parking";
  if (/(patio|hardscape|sidewalk|terrace|outdoor)/.test(l)) return "patio";
  if (/(building|roof|footprint|structure)/.test(l)) return "building";
  return "other";
}

export const LAYER_STYLE = {
  parking: { stroke: "oklch(0.98 0.006 230)", fill: "oklch(0.98 0.006 230 / 0.28)", name: "Parking area" },
  patio: { stroke: "oklch(0.8 0.16 85)", fill: "oklch(0.8 0.16 85 / 0.25)", name: "Patio space" },
  building: { stroke: "oklch(0.235 0.04 258)", fill: "oklch(0.235 0.04 258 / 0.15)", name: "Footprint" },
  other: { stroke: "oklch(0.7 0.18 30)", fill: "oklch(0.7 0.18 30 / 0.2)", name: "Other" },
} as const;

type Layer = keyof typeof LAYER_STYLE;

export function Aerial({ aerial }: { aerial: AerialData }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(
    aerial.widthPx && aerial.heightPx ? { w: aerial.widthPx, h: aerial.heightPx } : null,
  );
  const present = (Object.keys(LAYER_STYLE) as Layer[]).filter((k) => aerial.detections.some((d) => layerOf(d.label) === k));
  const [layers, setLayers] = useState<string[]>(present);
  const metresPerPx = size ? aerial.extentM / size.w : null;
  const barM = aerial.extentM > 150 ? 50 : 20;

  return (
    <div className="grid gap-x-8 gap-y-6 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <div
          className="relative w-full overflow-hidden rounded-sm border border-ink bg-ink"
          style={{ aspectRatio: size ? `${size.w} / ${size.h}` : "1 / 1" }}
        >
          <Image
            src={aerial.orthoPath}
            alt="Aerial view looking straight down at the building and its lot"
            fill
            sizes="(min-width: 1024px) 60vw, 100vw"
            className="object-cover"
            onLoad={(e) => {
              const img = e.currentTarget;
              if (!aerial.widthPx) setSize({ w: img.naturalWidth, h: img.naturalHeight });
            }}
          />
          {size ? (
            <svg viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
              {aerial.detections.map((d, i) => {
                const layer = layerOf(d.label);
                if (!layers.includes(layer)) return null;
                const s = LAYER_STYLE[layer];
                return (
                  <polygon
                    key={i}
                    points={d.polygon.map(([x, y]) => `${x},${y}`).join(" ")}
                    fill={s.fill}
                    stroke={s.stroke}
                    strokeWidth={2.5}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </svg>
          ) : null}
          {metresPerPx ? (
            <div className="absolute bottom-3 left-3 text-[0.6875rem] font-medium text-on-ink [text-shadow:0_1px_2px_rgb(0_0_0/0.8)]" style={{ width: `${(barM / aerial.extentM) * 100}%` }}>
              <div className="h-1.5 border-x-2 border-b-2 border-on-ink" />
              <span className="sr-only">Scale: </span>
              {barM} m
            </div>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          {present.length > 0 ? (
            <ToggleGroup multiple value={layers} onValueChange={(v) => setLayers(v as string[])} aria-label="Overlay layers" spacing={1}>
              {present.map((k) => (
                <ToggleGroupItem key={k} value={k} variant="outline" size="sm" className="gap-1.5 rounded-sm data-[pressed]:bg-ink data-[pressed]:text-on-ink">
                  <span aria-hidden className="inline-block size-2.5 rounded-[2px] border" style={{ background: LAYER_STYLE[k].stroke }} />
                  {LAYER_STYLE[k].name}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : (
            <p className="text-xs text-ink-2">No detections drawn on this image yet.</p>
          )}
          <Src>Vexcel ortho{aerial.captureDate ? `, captured ${monthYear(aerial.captureDate)}` : ""}</Src>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:col-span-5">
        <dl className="grid grid-cols-2 content-start gap-x-6 gap-y-6">
        <Fact label="Vehicles seen" value={aerial.vehicleCount != null ? num(aerial.vehicleCount) : "—"} note={<Src>Vexcel detection</Src>} />
        <Fact label="Building footprint" value={aerial.footprintSf != null ? sf(aerial.footprintSf) : "—"} note={<Src>Vexcel structure</Src>} />
        <Fact label="Parking areas detected" value={aerial.parkingSpaces != null ? num(aerial.parkingSpaces) : "—"} note={<Src>Vexcel detection</Src>} />
        {aerial.patioCandidateSf ? <Fact label="Patio candidate" value={sf(aerial.patioCandidateSf)} note={<Src>Vexcel hardscape</Src>} /> : null}
        {aerial.hardscapeSf != null ? <Fact label="Hardscape" value={sf(aerial.hardscapeSf)} note={<Src>Vexcel</Src>} /> : null}
        <Fact label="Captured" value={aerial.captureDate ? monthYear(aerial.captureDate) : "—"} note={<Src>Vexcel</Src>} />
        </dl>
        {aerial.obliquePath ? (
          <figure className="m-0">
            <div className="relative aspect-[4/3] overflow-hidden rounded-sm border border-ink bg-ink">
              <Image src={aerial.obliquePath} alt="Angled aerial view of the building and street" fill sizes="(min-width: 1024px) 35vw, 100vw" className="object-cover" />
            </div>
            <figcaption className="mt-1">
              <Src>Vexcel oblique</Src>
            </figcaption>
          </figure>
        ) : null}
      </div>
    </div>
  );
}
