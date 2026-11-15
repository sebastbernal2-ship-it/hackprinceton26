"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { linkProps, useFocusedFinding } from "./focus-store";

export type Vec3 = { x: number; y: number; z: number };

export type TourPin = {
  id: string;
  label: string;
  detail: string;
  tone: "needed" | "saved" | "maybe" | "info";
  position?: Vec3;
  /** pano the evidence came from; clicking moves the tour camera there */
  panoId?: string;
  source: string;
  image?: string;
};

type Status = "connecting" | "live" | "tour-only";

export const SDK_URL = "https://api.matterport.com/sdk/bootstrap/3.0.0-0-g0517b8d76c/sdk.es6.js";
export const CONNECT_TIMEOUT_MS = 20_000;

export const TAG_COLOR: Record<TourPin["tone"], { r: number; g: number; b: number }> = {
  needed: { r: 0.76, g: 0.2, b: 0.14 },
  saved: { r: 0.16, g: 0.5, b: 0.32 },
  maybe: { r: 0.85, g: 0.6, b: 0.1 },
  info: { r: 0.15, g: 0.2, b: 0.35 },
};

export const TONE_TEXT: Record<TourPin["tone"], string> = {
  needed: "You pay",
  saved: "Already there",
  maybe: "Unknown",
  info: "Note",
};

/** GraphQL model space is z-up; the Showcase SDK is y-up. */
const zUpToYUp = (p: Vec3): Vec3 => ({ x: p.x, y: p.z, z: -p.y });
const identity = (p: Vec3): Vec3 => p;

function dist(a: Vec3, b: Vec3) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export type SdkSweep = { sid: string; uuid?: string; position: Vec3 };

/** One SDK connection per iframe: a second connect on the same iframe never resolves. */
const connections = new WeakMap<HTMLIFrameElement, Promise<MpSdk>>();
export const addedTags = new WeakMap<HTMLIFrameElement, Promise<string[]>>();

export function connectOnce(iframe: HTMLIFrameElement, key: string): Promise<MpSdk> {
  let p = connections.get(iframe);
  if (!p) {
    p = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${SDK_URL}?applicationKey=${encodeURIComponent(key)}`).then(
      (mod: { connect(f: HTMLIFrameElement): Promise<MpSdk> }) => mod.connect(iframe),
    );
    p.catch(() => connections.delete(iframe));
    connections.set(iframe, p);
  }
  return p;
}

/* Minimal surface of the Showcase SDK we use. */
export type MpSdk = {
  Model: { getData(): Promise<{ sid: string; sweeps?: SdkSweep[] }> };
  Sweep: {
    moveTo(sweep: string, options?: { transition?: string }): Promise<string>;
    Transition?: { FLY: string };
  };
  Tag: {
    add(...t: object[]): Promise<string[]>;
    open(id: string): Promise<void>;
    close?(id: string): Promise<void>;
  };
  Camera?: { getPose?(): Promise<{ position: Vec3; sweep?: string }> };
  disconnect?: () => void;
};

export function MatterportTour({
  modelId,
  sdkKey,
  title,
  pins,
  panos,
}: {
  modelId: string;
  sdkKey: string | null;
  title: string;
  pins: TourPin[];
  panos: { id: string; position: Vec3 }[];
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sdkRef = useRef<MpSdk | null>(null);
  const [status, setStatus] = useState<Status>(sdkKey ? "connecting" : "tour-only");
  const [tagIds, setTagIds] = useState<Record<string, string>>({});

  const params = new URLSearchParams({ m: modelId, play: "1", qs: "1" });
  if (sdkKey) params.set("applicationKey", sdkKey);
  const src = `https://my.matterport.com/show?${params.toString()}`;

  useEffect(() => {
    if (!sdkKey || !iframeRef.current) return;
    let cancelled = false;
    const iframe = iframeRef.current;
    let connected = false;
    const timer = setTimeout(() => {
      if (!cancelled && !connected) setStatus("tour-only");
    }, CONNECT_TIMEOUT_MS);

    (async () => {
      try {
        const sdk = await connectOnce(iframe, sdkKey);
        connected = true;
        clearTimeout(timer);
        if (cancelled) return;
        sdkRef.current = sdk;        // Model.getData resolves once the model is loaded; it also carries sweep positions.
        // (Observable subscriptions did not deliver on this bootstrap, so we avoid them.)
        const model = await sdk.Model.getData();
        if (cancelled) return;
        setStatus("live");
        const placeable = pins.filter((p) => p.position);
        if (placeable.length === 0) return;

        const transform = pickTransform(model.sweeps ?? [], panos, placeable.map((p) => p.position!));
        const spread = spreadColocated(placeable.map((p) => p.position!));
        const descriptors = placeable.map((p, i) => ({
          label: p.label,
          description: `${TONE_TEXT[p.tone]}. ${p.detail}`,
          anchorPosition: transform(spread[i]),
          stemVector: { x: 0, y: 0.4, z: 0 },
          color: TAG_COLOR[p.tone],
        }));
        // Showcase only starts playing once the iframe is on screen; Tag.add waits for that.
        let added = addedTags.get(iframe);
        if (!added) {
          added = sdk.Tag.add(...descriptors);
          addedTags.set(iframe, added);
        }
        const ids = await added.catch(() => [] as string[]);
        if (cancelled) return;
        setTagIds(Object.fromEntries(placeable.flatMap((p, i) => (ids[i] ? [[p.id, ids[i]]] : []))));
        if (ids.length === 0) setStatus("tour-only");
      } catch (err) {
        if (!cancelled) {
          setStatus(connected ? "live" : "tour-only");
          if (process.env.NODE_ENV === "development") console.warn("Matterport SDK unavailable; showing plain tour.", err);
        }
      }
    })();

    return () => {
      // the connection belongs to the iframe and is reused if the effect re-runs (Strict Mode)
      cancelled = true;
      clearTimeout(timer);
      sdkRef.current = null;
    };
  }, [sdkKey, modelId, pins, panos]);

  const focused = useFocusedFinding();

  const focusPin = async (pin: TourPin) => {
    const sdk = sdkRef.current;
    if (!sdk) return;
    iframeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (pin.panoId) {
      // move the camera to the pano the evidence came from
      await sdk.Sweep.moveTo(pin.panoId, { transition: sdk.Sweep.Transition?.FLY }).catch(() => undefined);
    }
    const tag = tagIds[pin.id];
    if (tag) await sdk.Tag.open(tag).catch(() => undefined);
  };

  return (
    <div className="grid gap-x-8 gap-y-6 lg:grid-cols-12">
      <div className="lg:col-span-8">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-sm border border-ink bg-ink sm:aspect-video">
          <iframe
            ref={iframeRef}
            src={src}
            title={title}
            allow="fullscreen; xr-spatial-tracking"
            className="absolute inset-0 h-full w-full"
          />
        </div>
        <p className="mt-2 flex items-center gap-2 text-xs text-ink-2" role="status" aria-live="polite">
          <span
            aria-hidden
            className={cn(
              "inline-block size-2 rounded-full",
              status === "live" ? "bg-saved" : status === "connecting" ? "bg-maybe motion-safe:animate-pulse" : "bg-rule-strong",
            )}
          />
          {status === "live"
            ? Object.keys(tagIds).length > 0
              ? `Pins placed in the scan: ${Object.keys(tagIds).length}`
              : pins.some((p) => p.position)
                ? "Tour connected. Pins appear once the tour starts playing."
                : "Tour connected. No findings have a position in the scan yet."
            : status === "connecting"
              ? "Connecting to the scan to place pins"
              : "Tour only. Pins could not be placed; the list beside it has every finding."}
          <span className="ml-auto font-mono">src Matterport</span>
        </p>
      </div>

      <div className="lg:col-span-4">
        <h3 className="text-xs font-medium uppercase tracking-[0.06em] text-ink-2">What the scan and listing show</h3>
        {pins.length === 0 ? (
          <p className="mt-3 text-sm text-ink-2">No findings for this space yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-rule border-y border-rule lg:max-h-[33rem] lg:overflow-y-auto lg:pr-2" tabIndex={-1}>
            {pins.map((p) => {
              const live = status === "live" && Boolean(tagIds[p.id] || p.panoId);
              const Inner = (
                <>
                  <span className="flex items-center gap-2">
                    <span aria-hidden data-active={focused === p.id} className={cn("ping inline-block size-2.5 shrink-0 rounded-full", TONE_DOT[p.tone], TONE_RING[p.tone])} />
                    <span className="font-semibold leading-snug">{p.label}</span>
                    {live ? <MapPin aria-label="Pinned in the tour" className="ml-auto size-4 shrink-0 text-ink-2" /> : null}
                  </span>
                  <span className="mt-1 flex gap-3">
                    {p.image ? (
                      <span className="relative mt-0.5 h-12 w-16 shrink-0 overflow-hidden rounded-sm border border-rule-strong">
                        <Image src={p.image} alt="" fill sizes="64px" className="object-cover" />
                      </span>
                    ) : null}
                    <span>
                      <span className="block text-sm leading-snug text-ink-2">{p.detail}</span>
                      <span className="mt-1 block font-mono text-[0.6875rem] text-ink-2">src {p.source}</span>
                    </span>
                  </span>
                </>
              );
              return (
                <li key={p.id} {...linkProps(p.id)} data-active={focused === p.id} className="transition-colors duration-200 data-[active=true]:bg-paper-2">
                  {live ? (
                    <button
                      type="button"
                      onClick={() => void focusPin(p)}
                      aria-label={`Show ${p.label} in the 3D tour`}
                      className="block w-full py-3 text-left transition-colors hover:bg-paper-2 active:bg-rule/60"
                    >
                      {Inner}
                    </button>
                  ) : (
                    <div className="py-3">{Inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

const TONE_RING: Record<TourPin["tone"], string> = {
  needed: "text-needed",
  saved: "text-saved",
  maybe: "text-maybe-ink",
  info: "text-ink-2",
};

/**
 * Several findings often share one anchor (all seen from the same camera). Stacked tags read as one pin, so
 * co-located anchors are fanned out on a 0.7 m circle in the floor plane (model space is z-up), which keeps every
 * finding visible as its own pin.
 */
export function spreadColocated(points: Vec3[]): Vec3[] {
  const groups = new Map<string, number[]>();
  points.forEach((p, i) => {
    const k = `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`;
    groups.set(k, [...(groups.get(k) ?? []), i]);
  });
  const out = points.map((p) => ({ ...p }));
  for (const idx of groups.values()) {
    if (idx.length < 2) continue;
    idx.forEach((i, j) => {
      const a = (j / idx.length) * Math.PI * 2;
      out[i] = { x: points[i].x + Math.cos(a) * 0.7, y: points[i].y + Math.sin(a) * 0.7, z: points[i].z };
    });
  }
  return out;
}

const TONE_DOT: Record<TourPin["tone"], string> = {
  needed: "bg-needed",
  saved: "bg-saved",
  maybe: "bg-maybe",
  info: "bg-ink-2",
};

/**
 * Chooses the model-space → SDK transform by comparing our pano positions with the SDK's sweeps.
 * Verified on 4H2JSnQ3wSj: pano (0.047, −0.027, 1.376) is sweep (0.047, 1.376, 0.027), i.e. z-up → y-up.
 * Falls back to z-up → y-up when nothing can be compared.
 */
export function pickTransform(sweeps: SdkSweep[], panos: { id: string; position: Vec3 }[], fallbackPoints: Vec3[]): (p: Vec3) => Vec3 {
  const byId = new Map<string, Vec3>();
  for (const s of sweeps) {
    byId.set(s.sid, s.position);
    if (s.uuid) byId.set(s.uuid, s.position);
  }
  let errZ = 0;
  let errI = 0;
  let n = 0;
  for (const p of panos) {
    const s = byId.get(p.id);
    if (!s) continue;
    errZ += dist(zUpToYUp(p.position), s);
    errI += dist(identity(p.position), s);
    n++;
  }
  if (n === 0 && fallbackPoints.length > 0 && byId.size > 0) {
    // No shared ids: compare each anchor with its nearest sweep under both transforms.
    const all = [...new Set(byId.values())];
    const nearest = (p: Vec3) => Math.min(...all.map((s) => Math.hypot(s.x - p.x, s.z - p.z)));
    for (const p of fallbackPoints) {
      errZ += nearest(zUpToYUp(p));
      errI += nearest(identity(p));
      n++;
    }
  }
  if (process.env.NODE_ENV === "development") {
    console.info(`[tour] ${n} reference points; mean error z-up ${(errZ / (n || 1)).toFixed(2)} m, identity ${(errI / (n || 1)).toFixed(2)} m`);
  }
  if (n === 0) return zUpToYUp;
  return errI < errZ ? identity : zUpToYUp;
}
