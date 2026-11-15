"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { renderMessage, WIDE_KINDS } from "./messages/registry";
import { LAYOUT, REDUCED, SPRING, streamSeconds } from "./motion";
import type { ChatThreadProps, Message, SheetSnap } from "./types";

const SNAP_ORDER: SheetSnap[] = ["peek", "half", "full"];

function subscribeResize(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}

function sheetHeight(snap: SheetSnap, vh: number): number {
  return snap === "peek" ? 196 : Math.round(vh * (snap === "half" ? 0.46 : 0.92));
}

/** A message that arrives together with an assistant text waits for that text to finish typing. */
function arrivalDelay(messages: Message[], i: number): number {
  const prev = messages[i - 1];
  if (!prev || prev.at !== messages[i].at) return 0;
  if (prev.kind === "assistantText") return streamSeconds(prev.text);
  return 0;
}

/**
 * The conversation: a `role="log"` list that renders the Message union through messages/registry.tsx.
 * `center` (Clarify, Search, Pick; also the phone thread) is built for real. `panel` (Walk on desktop) and
 * `sheet` (Walk on phone) position and dress the surface correctly but the sheet is provisional: it cycles
 * snaps from the grabber and has no drag yet (the contract calls for the shadcn drawer / Vaul there).
 */
export function ChatThread({
  messages,
  phase,
  composer,
  onAction,
  layout,
  sheetSnap = "peek",
  onSheetSnap,
}: ChatThreadProps) {
  const reduce = useReducedMotion();
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const vh = useSyncExternalStore(
    subscribeResize,
    () => window.innerHeight,
    () => 844,
  );

  // follow new messages only while the reader is already at the bottom
  useEffect(() => {
    const el = scroller.current;
    if (!el || !atBottom.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [messages, reduce]);

  const log = (
    <div
      ref={scroller}
      role="log"
      aria-live="polite"
      aria-label="Conversation with Foreground"
      tabIndex={-1}
      onScroll={(e) => {
        const el = e.currentTarget;
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
      }}
      className={cn("flow-thread-mask min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain", layout === "center" ? "px-4" : "px-5")}
    >
      <ol className="flex min-h-full flex-col justify-end gap-6 pt-14 pb-6">
        {messages.map((m, i) => (
          <motion.li
            key={m.id}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, filter: "blur(6px)" }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={reduce ? REDUCED : { ...SPRING.ui, delay: arrivalDelay(messages, i) }}
            className={cn("mx-auto w-full", layout === "center" && (WIDE_KINDS.has(m.kind) ? "max-w-[1120px]" : "max-w-[720px]"))}
          >
            {renderMessage(m, { phase, latest: i === messages.length - 1, onAction })}
          </motion.li>
        ))}
      </ol>
    </div>
  );

  if (layout === "center") {
    return (
      <motion.section
        layoutId={LAYOUT.chatSurface}
        transition={reduce ? REDUCED : SPRING.morph}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        aria-label="Conversation"
        className="absolute inset-x-0 top-14 bottom-0 z-10 flex flex-col pb-[max(1rem,env(safe-area-inset-bottom))] sm:top-16 sm:pb-8"
      >
        {log}
        <div className="mx-auto w-full max-w-[752px] shrink-0 px-4">{composer}</div>
      </motion.section>
    );
  }

  if (layout === "panel") {
    return (
      <motion.section
        layoutId={LAYOUT.chatSurface}
        transition={reduce ? REDUCED : SPRING.morph}
        aria-label="Conversation"
        style={{ borderRadius: 28 }}
        className="glass-heavy relative z-10 flex h-full min-h-0 min-w-0 flex-col overflow-hidden pb-4"
      >
        {log}
        <div className="shrink-0 px-4">{composer}</div>
      </motion.section>
    );
  }

  const next = SNAP_ORDER[(SNAP_ORDER.indexOf(sheetSnap) + 1) % SNAP_ORDER.length];
  return (
    <motion.section
      layoutId={LAYOUT.chatSurface}
      aria-label="Conversation"
      initial={false}
      animate={{ height: sheetHeight(sheetSnap, vh) }}
      transition={reduce ? REDUCED : SPRING.sheet}
      style={{ borderTopLeftRadius: 28, borderTopRightRadius: 28 }}
      className="glass-heavy absolute inset-x-0 bottom-0 z-10 flex flex-col overflow-hidden border-b-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <button
        type="button"
        onClick={() => onSheetSnap?.(next)}
        aria-label={`Resize conversation, now ${sheetSnap}`}
        className="flex h-6 shrink-0 items-center justify-center"
      >
        <span className="h-1 w-9 rounded-full bg-line-strong" />
      </button>
      {log}
      <div className="shrink-0 px-4">{composer}</div>
    </motion.section>
  );
}
