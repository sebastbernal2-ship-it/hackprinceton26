"use client";

import { motion, useReducedMotion } from "motion/react";
import { usdRange } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useFlowContext } from "../flow-context";
import { DUR, REDUCED, SPRING } from "../motion";
import type { Tone } from "../types";
import type { MessageRendererProps } from "./registry";
import { StreamText } from "./stream-text";

export const TONE_CHIP: Record<Tone, string> = {
  needed: "bg-needed-wash text-needed",
  saved: "bg-saved-wash text-saved",
  maybe: "bg-maybe-wash text-maybe",
  info: "bg-live-wash text-live",
};

/** One stop of the guided walk. Active: streams, offers the next stop. Visited: dims; tapping glides back to it. */
export function WalkStepMessage({ message: m, onAction }: MessageRendererProps<"walkStep">) {
  const reduce = useReducedMotion();
  const { compact } = useFlowContext();
  const active = m.state === "active";
  const last = m.index >= m.total - 1;
  const pill = "flow-label inline-flex h-11 items-center rounded-full px-5 transition-transform duration-100 active:scale-[0.97]";

  return (
    <div className={cn("flex flex-col gap-3 transition-opacity duration-300", !active && "opacity-55")} aria-current={active ? "step" : undefined}>
      <button
        type="button"
        onClick={() => onAction({ type: "walkGo", index: m.index })}
        disabled={active}
        className="flex flex-col items-start gap-0.5 text-left disabled:cursor-default"
      >
        <span className="flow-label text-text-2">
          Stop {m.index + 1} of {m.total}
        </span>
        <span className="flow-title text-text">{m.title}</span>
      </button>
      {active || !compact ? <StreamText id={m.id} text={m.text} streaming={m.streaming} className={cn("text-[0.9375rem]", compact && "line-clamp-2")} /> : null}
      {m.pin && !compact ? (
        <motion.p
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? REDUCED : { ...SPRING.ui, delay: active ? DUR.glide : 0 }}
          className={cn("flow-label w-fit rounded-full px-3 py-1", TONE_CHIP[m.pin.tone])}
        >
          {m.pin.label}
          {m.pin.amountUsd ? `, ${m.pin.tone === "saved" ? "saves about" : "about"} ${usdRange(m.pin.amountUsd)}` : ""}
        </motion.p>
      ) : null}
      {!compact ? <p className="flow-source text-text-3">{m.source}</p> : null}
      {active ? (
        <div className="flex flex-wrap gap-2">
          {last ? (
            <button type="button" onClick={() => onAction({ type: "walkGo", index: m.total })} className={cn(pill, "bg-text font-semibold text-stage")}>
              See the business
            </button>
          ) : (
            <>
              <button type="button" onClick={() => onAction({ type: "walkGo", index: m.index + 1 })} className={cn(pill, "bg-text font-semibold text-stage")}>
                Next stop
              </button>
              <button type="button" onClick={() => onAction({ type: "walkGo", index: m.total })} className={cn(pill, "glass text-text")}>
                See the business
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
