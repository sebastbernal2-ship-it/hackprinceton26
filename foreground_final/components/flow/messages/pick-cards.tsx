"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { num, usdRange } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DUR, LAYOUT, REDUCED, SPRING, stagger } from "../motion";
import type { SpacePick, Tone } from "../types";
import type { MessageRendererProps } from "./registry";
import { isSettled, StreamText } from "./stream-text";

const CHIP: Record<Tone, string> = {
  needed: "bg-needed-wash text-needed",
  saved: "bg-saved-wash text-saved",
  maybe: "bg-maybe-wash text-maybe",
  info: "bg-live-wash text-live",
};

function Chip({ pick, className }: { pick: SpacePick; className?: string }) {
  if (!pick.highlight) return null;
  return (
    <span className={cn("flow-label w-fit items-center rounded-full px-3 py-1", CHIP[pick.highlight.tone], className)}>
      {pick.highlight.text}
    </span>
  );
}

/**
 * The three spaces worth a look: 357x476 cards in a 1120 row on desktop, stacked 16:10 on phone. The photo is the
 * shared element (`space-media-{siteId}`, `space-title-{siteId}`): tapping a card morphs it into the Stage.
 */
export function PickCardsMessage({ message, onAction }: MessageRendererProps<"pickCards">) {
  const reduce = useReducedMotion();
  const [wait] = useState(() => (isSettled(message.id) ? 0 : 0.15));
  const [hovered, setHovered] = useState<string | null>(null);
  const chosen = message.chosenSiteId;

  return (
    <div className="flex flex-col gap-4">
      <StreamText id={message.id} text={message.intro} className="max-w-[60ch]" />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-6" aria-label="Spaces worth a look" onMouseLeave={() => setHovered(null)}>
        {message.picks.map((p, i) => {
          const isChosen = chosen === p.siteId;
          const other = chosen !== undefined && !isChosen;
          const dimmed = hovered !== null && hovered !== p.siteId;
          const lifted = hovered === p.siteId && chosen === undefined;
          return (
            <motion.li
              key={p.siteId}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
              animate={
                other
                  ? { opacity: 0, y: reduce ? 0 : 40 }
                  : isChosen
                    ? { opacity: 0, y: 0 }
                    : { opacity: dimmed ? 0.72 : 1, y: lifted && !reduce ? -4 : 0 }
              }
              transition={reduce ? REDUCED : other || isChosen ? SPRING.ui : { ...SPRING.ui, delay: hovered === null && chosen === undefined ? wait + stagger(i) : 0 }}
            >
              <motion.button
                type="button"
                disabled={chosen !== undefined}
                onClick={() => onAction({ type: "pick", siteId: p.siteId })}
                onMouseEnter={() => setHovered(p.siteId)}
                onFocus={() => setHovered(p.siteId)}
                onBlur={() => setHovered(null)}
                whileTap={chosen === undefined ? { scale: 0.97, transition: { duration: DUR.press } } : undefined}
                aria-label={`Walk through ${p.address}, ${p.city}. Build-out estimate ${usdRange(p.allInUsd)}.`}
                className="relative block aspect-[16/10] w-full overflow-hidden rounded-f-lg bg-stage-2 text-left sm:aspect-auto sm:h-[min(476px,calc(100vh-380px))]"
              >
                {!isChosen ? (
                  <motion.div layoutId={LAYOUT.spaceMedia(p.siteId)} transition={reduce ? REDUCED : SPRING.morph} className="absolute inset-0">
                    <motion.div
                      className="absolute inset-0"
                      animate={{ scale: lifted && !reduce ? 1.03 : 1 }}
                      transition={reduce ? REDUCED : SPRING.ui}
                    >
                      {p.photo ? <Image src={p.photo} alt="" fill sizes="(min-width: 640px) 357px, 358px" className="object-cover" /> : null}
                    </motion.div>
                  </motion.div>
                ) : null}
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,oklch(0.12_0.01_60/0.92),transparent_75%)]" />
                <Chip pick={p} className="absolute top-4 right-4 inline-flex bg-stage/70 backdrop-blur-md sm:hidden" />

                <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-4 sm:gap-1.5 sm:p-6">
                  <p className="flow-label text-text">
                    #{p.rank}
                    {p.hasScan ? " · 3D scan" : ""}
                  </p>
                  <p className="font-sans text-[1.5rem] leading-none font-semibold tracking-[-0.02em] text-text tabular-nums sm:text-[2rem]">
                    {usdRange(p.allInUsd)}
                  </p>
                  <p className="flow-source text-text-2">all-in build-out, estimate</p>
                  <h3 className="flow-title mt-1 text-text">
                    <motion.span layoutId={LAYOUT.spaceTitle(p.siteId)} transition={reduce ? REDUCED : SPRING.morph} className="inline-block">
                      {p.address}
                    </motion.span>
                    <span className="block text-sm font-normal text-text-2">
                      {p.city}
                      {p.sf ? `, ${num(p.sf)} SF` : ""}
                    </span>
                  </h3>
                  <p className="line-clamp-1 text-sm leading-snug text-text-2 sm:line-clamp-2">{p.reason}</p>
                  <Chip pick={p} className="mt-1 hidden sm:inline-flex" />
                </div>
              </motion.button>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
