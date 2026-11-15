"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { DUR, REDUCED, SPRING, stagger, streamSeconds } from "../motion";
import type { MessageRendererProps } from "./registry";
import { isSettled, StreamText } from "./stream-text";

/**
 * One question with tappable answers. The chips arrive after the question has typed itself; the chosen one
 * pops, the rest fade to 0.4 and lock. A typed answer (the composer) locks them the same way.
 */
export function ClarifyChipsMessage({ message, onAction }: MessageRendererProps<"clarifyChips">) {
  const reduce = useReducedMotion();
  // chips wait for the question only the first time this message is shown
  const [wait] = useState(() => (isSettled(message.id) ? 0 : streamSeconds(message.question)));
  const answered = message.answer !== undefined;

  return (
    <div className="flex flex-col gap-3">
      <StreamText id={message.id} text={message.question} />
      <div role="group" aria-label={message.question} className="flex flex-wrap gap-2">
        {message.options.map((o, i) => {
          const chosen = answered && o.value === message.answer;
          return (
            <motion.button
              key={String(o.value)}
              type="button"
              disabled={answered}
              aria-pressed={chosen}
              onClick={() => onAction({ type: "answer", messageId: message.id, value: o.value })}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: answered && !chosen ? 0.4 : 1, y: 0, scale: 1 }}
              whileTap={answered ? undefined : { scale: 0.97, transition: { duration: DUR.press } }}
              transition={
                reduce ? REDUCED : answered ? (chosen ? SPRING.pop : SPRING.ui) : { ...SPRING.ui, delay: wait + stagger(i) }
              }
              className={cn(
                "flow-label inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-text",
                "glass transition-colors duration-150 enabled:hover:bg-stage-3/80",
                chosen && "border-line-strong bg-text/15",
                answered && "cursor-default",
              )}
            >
              {chosen ? <Check aria-hidden="true" className="size-3.5" strokeWidth={2.5} /> : null}
              {o.label}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
