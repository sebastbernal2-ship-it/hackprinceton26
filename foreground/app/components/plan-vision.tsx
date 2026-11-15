"use client";

import { useEffect, useRef, useState } from "react";
import { isWalkLayout, summarizeLayout, type LayoutSummary } from "../lib/layout-summary";
import Stepper from "./stepper";

type PlanVisionProps = { tourId: string; title: string; detail?: string; onClose: () => void; onContinue?: (layout: LayoutSummary | null) => void; onStep?: (step: number) => void; step?: number };

/**
 * Step 4, Project layout: Davd's first-person 3D model of the scan (modeling/walk.html, served at /walk3d/), where the
 * owner walks the space, moves or removes furniture and places catalogue pieces. Needs a local walk export
 * (assets_<id>/walk/, from modeling/walk_export.py); without one it falls back to Matterport's read-only tour.
 */
export default function PlanVision({ tourId, title, detail, onClose, onContinue, onStep, step }: PlanVisionProps) {
  const [ready, setReady] = useState<boolean | null>(tourId ? null : false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const layoutRef = useRef<LayoutSummary | null>(null);

  // The viewer posts its layout (same origin only) whenever an edit is saved, and when asked.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      if (isWalkLayout(event.data) && event.data.model === tourId) layoutRef.current = summarizeLayout(event.data);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [tourId]);

  async function continueToQuantify() {
    // ask for a fresh summary, then give the viewer a moment to answer; fall back to the last one it sent
    frameRef.current?.contentWindow?.postMessage({ type: "walk-layout-request" }, window.location.origin);
    await new Promise((r) => setTimeout(r, 250));
    onContinue?.(layoutRef.current);
  }

  useEffect(() => {
    if (!tourId) return;
    let live = true;
    fetch(`/walk3d/available?model=${encodeURIComponent(tourId)}`)
      .then((r) => (r.ok ? r.json() : { walk: false }))
      .then((d: { walk?: boolean }) => live && setReady(Boolean(d.walk)))
      .catch(() => live && setReady(false));
    return () => { live = false; };
  }, [tourId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !document.pointerLockElement) onClose(); };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = previous; };
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label={`Plan your space at ${title}`} className="fixed inset-0 z-50 flex flex-col bg-background text-foreground animate-rise">
      <header className="flex shrink-0 flex-wrap items-center gap-4 px-4 py-3 md:px-6">
        <button type="button" onClick={onClose} className="rounded-full border border-foreground/15 px-4 py-2 text-sm font-medium transition-opacity hover:opacity-70">
          Back to property
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium tracking-tight">{title}{detail ? ` · ${detail}` : ""}</p>
          <p className="truncate text-xs text-foreground/50">Walk the scan, rearrange it, and place new pieces. Edits are a sketch, not a measured plan.</p>
        </div>
        <div className="hidden lg:block"><Stepper active={step ?? 3} onStep={onStep} /></div>
        {onContinue && ready && (
          <button type="button" onClick={() => void continueToQuantify()} className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90">
            Continue to Quantify
          </button>
        )}
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-t-[1.35rem] bg-[#15171b]">
        {ready === null && (
          <div className="absolute inset-0 flex items-center justify-center" role="status" aria-label="Loading the 3D model">
            <span className="inline-block h-2.5 w-2.5 animate-breathe rounded-full bg-white/60" />
          </div>
        )}
        {ready === true && (
          <iframe ref={frameRef} title={`3D model of ${title}`} src={`/walk3d/walk.html?model=${encodeURIComponent(tourId)}`} className="absolute inset-0 h-full w-full border-0" allow="fullscreen" />
        )}
        {ready === false && tourId && (
          <>
            <iframe
              title={`Matterport tour of ${title}`}
              src={`https://my.matterport.com/show/?m=${encodeURIComponent(tourId)}&play=1&qs=1&dh=1&brand=0&title=0`}
              className="absolute inset-0 h-full w-full border-0"
              allow="fullscreen; xr-spatial-tracking"
              allowFullScreen
            />
            <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-3 bg-black/75 px-5 py-4 text-white backdrop-blur-sm">
              <div>
                <p className="text-sm font-medium">Read-only Matterport tour</p>
                <p className="mt-1 text-xs text-white/65">The editable planning export is not available. You can still explore the scan; furniture edits and layout counts are unavailable.</p>
              </div>
              {onContinue && (
                <button type="button" onClick={() => onContinue(null)} className="shrink-0 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black">
                  Continue without a layout
                </button>
              )}
            </div>
          </>
        )}
        {ready === false && !tourId && (
          <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-white">
            <div className="max-w-md">
              <p className="text-lg font-medium">No 3D model for this space yet</p>
              <p className="mt-3 text-sm text-white/60">There is no Matterport scan on file for this space.</p>
              {onContinue && (
                <button type="button" onClick={() => onContinue(null)} className="mt-6 block w-full rounded-full border border-white/50 px-5 py-2.5 text-sm font-medium text-white">
                  Continue to Quantify without a layout
                </button>
              )}
              <button type="button" onClick={onClose} className="mt-8 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black">
                Back to property
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
