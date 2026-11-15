"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { animate, AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { DUR, EASE, LAYOUT, REDUCED, SPRING, stagger } from "../motion";
import type { MessageOf } from "../types";
import type { MessageRendererProps } from "./registry";

type Candidate = MessageOf<"searchProgress">["candidates"][number];

/** "7 of 12 checked": the 7 tweens instead of jumping */
function Count({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.textContent = String(value);
      shown.current = value;
      return;
    }
    const controls = animate(shown.current, value, {
      duration: Math.min(DUR.count, 0.25 + Math.abs(value - shown.current) * 0.08),
      ease: EASE.out,
      onUpdate: (v) => {
        shown.current = v;
        el.textContent = String(Math.round(v));
      },
    });
    return () => controls.stop();
  }, [value, reduce]);
  return <span ref={ref}>{value}</span>;
}

/**
 * One thumb. Queued spaces are dim empty tiles; when the agent opens one, the photo flips in (rotateY 90 to 0).
 * Kept ones get a bone ring; rejected ones get a strike line that draws, then settle to 0.45 opacity.
 * The photo carries `space-media-{siteId}` so the kept ones can fly into their pick card.
 */
function Thumb({ c, index }: { c: Candidate; index: number }) {
  const reduce = useReducedMotion();
  const opened = c.state !== "queued";
  const rejected = c.state === "rejected";

  return (
    <li
      className="relative aspect-[4/3] [perspective:600px]"
      aria-label={`${c.address}: ${c.state === "queued" ? "waiting" : c.state === "inspecting" ? "looking inside" : c.state}`}
    >
      <div className="absolute inset-0 rounded-f-sm bg-stage-2/70" />
      {opened ? (
        <motion.div
          layoutId={c.state === "kept" ? LAYOUT.spaceMedia(c.siteId) : undefined}
          initial={reduce ? { opacity: 0 } : { rotateY: 90, opacity: 0 }}
          animate={{ rotateY: 0, opacity: rejected ? 0.45 : 1 }}
          transition={reduce ? REDUCED : { ...SPRING.ui, delay: c.state === "inspecting" ? 0 : stagger(index) / 2 }}
          className={cn(
            "absolute inset-0 overflow-hidden rounded-f-sm bg-stage-3 transition-[box-shadow] duration-300",
            c.state === "kept" && "ring-2 ring-text/90",
            c.state === "inspecting" && "ring-2 ring-live",
          )}
        >
          {c.photo ? <Image src={c.photo} alt="" fill sizes="96px" className="object-cover" /> : null}
        </motion.div>
      ) : null}
      {rejected ? (
        <motion.span
          aria-hidden="true"
          initial={reduce ? { opacity: 0 } : { scaleX: 0 }}
          animate={reduce ? { opacity: 1 } : { scaleX: 1 }}
          transition={reduce ? REDUCED : { duration: DUR.state, ease: EASE.out }}
          className="absolute top-1/2 -right-1 -left-1 h-0.5 origin-left -rotate-[14deg] rounded-full bg-text"
        />
      ) : null}
    </li>
  );
}

export function SearchProgressMessage({ message, phase, onAction }: MessageRendererProps<"searchProgress">) {
  const reduce = useReducedMotion();
  const running = message.status === "running";
  // once the picks are up the thread above them shrinks to this one line, so the cards fit the fold
  const compact = phase === "pick" || phase === "walk";
  const rejected = compact ? [] : message.candidates.filter((c) => c.state === "rejected" && c.reason);

  return (
    <div className="flex flex-col gap-3">
      <p className="flow-chat flex flex-wrap items-baseline gap-x-3" role="status">
        {running ? (
          reduce ? (
            <span className="text-text-2">Working…</span>
          ) : (
            <span className="flow-shimmer">{message.headline}</span>
          )
        ) : (
          <span className={message.status === "error" ? "text-needed" : "text-text"}>{message.headline}</span>
        )}
        <span className="text-sm text-text-3 tabular-nums">
          <Count value={message.checked} /> of {message.total} checked
        </span>
      </p>

      {message.status === "error" ? (
        <div role="alert" className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-sm text-text-2">{message.error}</p>
          <button
            type="button"
            onClick={() => onAction({ type: "retrySearch" })}
            className="flow-label inline-flex h-11 items-center rounded-full bg-text px-5 font-semibold text-stage transition-transform duration-100 active:scale-[0.97]"
          >
            Retry
          </button>
        </div>
      ) : null}

      {message.candidates.length && !compact ? (
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6" aria-label="Spaces being checked">
          {message.candidates.map((c, i) => (
            <Thumb key={c.siteId} c={c} index={i} />
          ))}
        </ul>
      ) : null}

      {rejected.length ? (
        <ul className="flex flex-col gap-1.5" aria-label="Spaces ruled out, and why">
          <AnimatePresence initial={false}>
            {rejected.map((c) => (
              <motion.li
                key={c.siteId}
                layout="position"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduce ? REDUCED : SPRING.ui}
                className="text-sm leading-snug text-text-3"
              >
                <span className="text-text-2">{c.address}</span>
                {" · "}
                {c.reason}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      ) : null}
    </div>
  );
}
