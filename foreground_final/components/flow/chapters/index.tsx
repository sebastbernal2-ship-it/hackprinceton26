"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Chapter } from "../chapter-model";
import { REDUCED, SPRING } from "../motion";
import { DealChapter } from "./deal";
import { LayoutChapter } from "./layout";
import { NumbersChapter } from "./numbers";
import { OverviewChapter } from "./overview";
import { RoomChapter } from "./room";
import type { ChapterProps } from "./types";
import { WalkChapter } from "./walk";

/** The stage cell: the open chapter's canvas, cross-fading over the pano (exit 0.2 s scale 0.985, enter springs up). */
export function ChapterStage({ chapter, ...props }: { chapter: Chapter } & ChapterProps) {
  const reduce = useReducedMotion();
  const body =
    chapter === "overview" ? (
      <OverviewChapter {...props} />
    ) : chapter === "walk" ? (
      <WalkChapter {...props} />
    ) : chapter === "layout" ? (
      <LayoutChapter {...props} />
    ) : chapter === "room" ? (
      <RoomChapter {...props} />
    ) : chapter === "numbers" ? (
      <NumbersChapter {...props} />
    ) : (
      <DealChapter {...props} />
    );
  return (
    <div className="relative min-h-0 min-w-0">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={chapter}
          className="pointer-events-none absolute inset-0"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0, transition: REDUCED } : { opacity: 0, scale: 0.985, transition: { duration: 0.2 } }}
          transition={reduce ? REDUCED : SPRING.ui}
        >
          {body}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
