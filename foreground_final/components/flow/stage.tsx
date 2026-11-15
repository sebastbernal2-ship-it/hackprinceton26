"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usdRange } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TONE_CHIP } from "./messages/walk-step";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BACKDROP, DUR, EASE, LAYOUT, SPRING } from "./motion";
import type { StageProps } from "./types";

const PanoViewer = dynamic(() => import("@/components/immersive/pano-viewer").then((m) => m.PanoViewer), { ssr: false });

/**
 * Everything behind the chat. `backdrop` (Ask through Pick) is built: real scanned interiors cross-fading every
 * 9s, each drifting slowly, under a scrim that deepens and blurs once the thread is up (`dim`).
 * `space` / `spaceDim` (Walk, Imagine, Outlook) only show the poster so far: the viewer, pins, header chip and
 * tour pill mount here in the Walk step, using the rest of StageProps.
 */
export function Stage({
  mode,
  backdrop,
  dim = false,
  site,
  poster,
  viewerRef,
  onViewerReady,
  focus,
  imagined,
  showBefore,
  furniture,
  empty = false,
  grid = false,
  working,
  header,
  tour,
  rightInset,
  leftInset = 0,
  onPano,
  onAction,
}: StageProps) {
  const reduce = useReducedMotion();
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const ready = Boolean(site) && readyFor === site?.id;
  const hasViewer = mode !== "backdrop" && Boolean(site?.matterport?.panos.length);
  const showImagined = Boolean(imagined) && !showBefore;
  const [index, setIndex] = useState(0);
  const cycling = mode === "backdrop" && backdrop.length > 1 && !reduce;

  useEffect(() => {
    if (!cycling) return;
    // the loop pauses while the tab is hidden
    const t = setInterval(() => {
      if (!document.hidden) setIndex((n) => (n + 1) % backdrop.length);
    }, BACKDROP.every * 1000);
    return () => clearInterval(t);
  }, [cycling, backdrop.length]);

  const shot = backdrop[index % Math.max(backdrop.length, 1)];

  return (
    <div className="absolute inset-0 z-0 overflow-hidden bg-stage" aria-hidden={mode === "backdrop"}>
      {mode === "backdrop" && shot ? (
        <motion.div
          className="absolute inset-0"
          initial={false}
          animate={{ filter: dim && !reduce ? "blur(12px)" : "blur(0px)" }}
          transition={{ duration: DUR.reveal, ease: EASE.out }}
        >
          <AnimatePresence initial={false}>
            <motion.div
              key={shot.src}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: BACKDROP.fade, ease: "linear" } }}
              // the outgoing photo stays opaque under the incoming one, then leaves
              exit={{ opacity: 0, transition: { duration: 0.01, delay: BACKDROP.fade } }}
            >
              <Image src={shot.src} alt="" fill priority={index === 0} sizes="100vw" className="flow-drift object-cover" />
            </motion.div>
          </AnimatePresence>
        </motion.div>
      ) : null}

      {/* the live viewer mounts under the poster at full size; the poster fades once it reports ready */}
      {hasViewer && site ? (
        <motion.div
          className="absolute inset-0"
          initial={false}
          animate={{ filter: mode === "spaceDim" && !reduce ? "blur(12px)" : "blur(0px)" }}
          transition={{ duration: DUR.reveal, ease: EASE.out }}
        >
          <PanoViewer
            key={site.id}
            ref={viewerRef}
            site={site}
            mode={showImagined ? "imagined" : empty ? "empty" : "scanned"}
            furniture={showImagined ? null : furniture}
            grid={grid}
            imaginedVersion={imagined}
            chrome={false}
            className="absolute inset-0"
            onPanoChange={(id) => onPano?.(id)}
            onReady={() => {
              setReadyFor(site.id);
              onViewerReady?.();
            }}
          />
        </motion.div>
      ) : null}

      {mode !== "backdrop" && site && poster ? (
        <motion.div
          layoutId={LAYOUT.spaceMedia(site.id)}
          transition={SPRING.morph}
          className="pointer-events-none absolute inset-0"
          animate={{ opacity: ready ? 0 : 1 }}
        >
          <Image src={poster} alt={site.address ?? ""} fill sizes="100vw" className="object-cover" />
        </motion.div>
      ) : null}

      {/* scrim: 0.55 on Ask, 0.78 once the thread is up, 0.7 behind the outlook */}
      <motion.div
        className="absolute inset-0 bg-stage"
        initial={false}
        animate={{ opacity: mode === "space" ? 0 : mode === "spaceDim" ? 0.7 : dim ? 0.78 : 0.55 }}
        transition={{ duration: DUR.reveal, ease: EASE.out }}
      />
      {/* keeps the top bar and the bottom edge legible on any photo */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,oklch(0.12_0.01_60/0.6),transparent_22%,transparent_62%,oklch(0.12_0.01_60/0.7))]" />

      {working ? (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-1/3 bg-[linear-gradient(to_right,transparent,oklch(0.82_0.09_235/0.18),transparent)]"
          initial={{ x: "-100%" }}
          animate={reduce ? { x: "100%", opacity: 0.5 } : { x: ["-100%", "300%"] }}
          transition={reduce ? { duration: 0 } : { duration: 2.2, ease: "linear", repeat: Infinity }}
        />
      ) : null}

      {mode !== "backdrop" && header ? (
        <div className="absolute top-16 left-4 z-10 flex items-center gap-3 sm:top-[72px] sm:left-8" style={leftInset ? { left: leftInset } : undefined}>
          <div className="glass flex h-11 max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full pr-4 pl-1">
            <button
              type="button"
              onClick={() => onAction({ type: "back" })}
              aria-label="Back to the three spaces"
              className="grid size-9 place-items-center rounded-full text-text transition-transform duration-100 hover:bg-[oklch(1_0_0/0.08)] active:scale-[0.97]"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 3 5 8l5 5" />
              </svg>
            </button>
            <span className="truncate text-sm font-medium text-text">{header.address}</span>
            <span className="flow-source hidden shrink-0 text-text-2 sm:inline">{header.rentLabel}</span>
            <Link href={`/site/${site?.id}`} className="flow-label shrink-0 text-text-2 underline-offset-4 hover:text-text hover:underline">
              Full details
            </Link>
          </div>
        </div>
      ) : null}

      {mode === "space" && showImagined ? (
        <div className="absolute inset-x-0 top-28 z-10 flex justify-center sm:top-32" style={{ left: leftInset, right: rightInset }}>
          <button
            type="button"
            onPointerDown={() => onAction({ type: "holdBefore", held: true })}
            onPointerUp={() => onAction({ type: "holdBefore", held: false })}
            onPointerLeave={() => onAction({ type: "holdBefore", held: false })}
            onPointerCancel={() => onAction({ type: "holdBefore", held: false })}
            className="flow-label glass inline-flex h-11 touch-none items-center rounded-full px-5 text-text select-none active:scale-[0.97]"
          >
            Hold to see before
          </button>
        </div>
      ) : null}

      <AnimatePresence>
        {mode === "space" && focus?.pin ? (
          <motion.div
            key={focus.panoId + focus.pin.label}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute top-[34%] z-10 flex justify-center px-4"
            style={{ left: leftInset, right: rightInset }}
          >
            <p className="glass flow-label flex max-w-[280px] flex-col gap-1 rounded-f-md px-4 py-2 text-text">
              <span className={cn("w-fit rounded-full px-2 py-0.5", TONE_CHIP[focus.pin.tone])}>{focus.pin.label}</span>
              {focus.pin.amountUsd ? <span className="tabular-nums">about {usdRange(focus.pin.amountUsd)}</span> : null}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {mode === "space" && tour ? (
        <div className="pointer-events-none absolute bottom-8 z-10 hidden justify-center sm:flex" style={{ left: leftInset, right: rightInset }}>
          <div className="glass pointer-events-auto flex h-12 items-center gap-1 rounded-full px-1">
            <button
              type="button"
              aria-label="Previous stop"
              disabled={tour.index <= 0}
              onClick={() => onAction({ type: "walkGo", index: tour.index - 1 })}
              className="grid size-10 place-items-center rounded-full text-text transition-transform duration-100 hover:bg-[oklch(1_0_0/0.08)] active:scale-[0.97] disabled:opacity-35"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 3 5 8l5 5" />
              </svg>
            </button>
            <span className="flow-label min-w-16 text-center text-text tabular-nums">
              {tour.index + 1} of {tour.total}
            </span>
            <button
              type="button"
              aria-label="Next stop"
              disabled={tour.index >= tour.total - 1}
              onClick={() => onAction({ type: "walkGo", index: tour.index + 1 })}
              className="grid size-10 place-items-center rounded-full text-text transition-transform duration-100 hover:bg-[oklch(1_0_0/0.08)] active:scale-[0.97] disabled:opacity-35"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m6 3 5 5-5 5" />
              </svg>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
