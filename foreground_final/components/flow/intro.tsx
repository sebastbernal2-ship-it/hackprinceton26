"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { animate, motion } from "motion/react";
import { EASE } from "./motion";

/** Lengths of the intro, seconds (docs/deal-flow-plan.md 2.0). The whole thing stays under 3 s. */
export const INTRO = { photoGap: 0.18, photoLen: 0.36, wordAt: 0.6, wordLen: 1.1, statsAt: 1.6, riseAt: 2.2, endAt: 2.8, skipMs: 150 } as const;

export const INTRO_KEY = "foreground-intro-seen";

export type IntroStats = { spaces: number; scans: number; tenants: number };

function Count({ to, delay }: { to: number; delay: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const c = animate(0, to, { duration: 0.5, delay, ease: EASE.out, onUpdate: (v) => setN(Math.round(v)) });
    return () => c.stop();
  }, [to, delay]);
  return <span className="tabular-nums">{n}</span>;
}

/**
 * The name. Real spaces come to the foreground: the scanned interiors fly at the viewer one after another, the
 * wordmark wipes in, a line counts what is loaded, then the wordmark shrinks into the header mark (shared
 * `layoutId="wordmark"`) while the Ask headline rises. Any key, click or wheel skips: everything jumps to its end
 * state in 150 ms. `onRise` fires when the header mark and the Ask screen should mount; `onDone` removes this.
 * Photos fly in reverse so the one that stays is `photos[0]`, the Ask backdrop's first frame.
 */
export function Intro({
  photos,
  stats,
  wordmark,
  onRise,
  onDone,
}: {
  photos: { src: string; alt: string }[];
  stats: IntroStats;
  /** the header's mark, same text and layoutId; this component renders the big one */
  wordmark: (big: boolean) => React.ReactNode;
  onRise: () => void;
  onDone: () => void;
}) {
  const [leaving, setLeaving] = useState<"slow" | "fast" | null>(null);
  const [wordGone, setWordGone] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const risen = useRef(false);
  const rise = useRef(onRise);
  const done = useRef(onDone);
  useEffect(() => {
    rise.current = onRise;
    done.current = onDone;
  });

  useEffect(() => {
    const doRise = (speed: "slow" | "fast") => {
      if (risen.current) return;
      risen.current = true;
      // one batch: the big mark leaves here while the header mark and Ask mount, so the layout transition links them
      setWordGone(true);
      setLeaving(speed);
      rise.current();
    };
    const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
    at(INTRO.riseAt * 1000, () => doRise("slow"));
    at(INTRO.endAt * 1000, () => done.current());
    const skip = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      doRise("fast");
      at(INTRO.skipMs + 20, () => done.current());
    };
    window.addEventListener("keydown", skip, { once: true });
    window.addEventListener("pointerdown", skip, { once: true });
    window.addEventListener("wheel", skip, { once: true, passive: true });
    return () => {
      timers.current.forEach(clearTimeout);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("wheel", skip);
    };
  }, []);

  const fly = [...photos].reverse();

  return (
    <motion.div
      role="presentation"
      className="fixed inset-0 z-50 overflow-hidden bg-stage"
      initial={{ opacity: 1 }}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={leaving === "fast" ? { duration: INTRO.skipMs / 1000, ease: "linear" } : { duration: INTRO.endAt - INTRO.riseAt, ease: EASE.out }}
      style={{ pointerEvents: leaving ? "none" : "auto" }}
    >
      <div className="absolute inset-0" style={{ perspective: 1200 }}>
        {fly.map((p, i) => {
          const last = i === fly.length - 1;
          return (
            <motion.div
              key={p.src}
              className="absolute inset-0"
              initial={{ opacity: 0, z: -900, filter: "blur(6px)" }}
              animate={{
                opacity: last ? [0, 1, 1] : [0, 1, 0],
                z: [-900, -450, 0],
                filter: ["blur(6px)", "blur(2px)", "blur(0px)"],
              }}
              transition={{ delay: i * INTRO.photoGap, duration: INTRO.photoLen * 2, times: [0, 0.5, 1], ease: "easeOut" }}
            >
              <Image src={p.src} alt="" fill priority sizes="100vw" className="object-cover" />
            </motion.div>
          );
        })}
      </div>
      <div className="absolute inset-0 bg-stage/55" />

      {!wordGone ? (
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-5">
            <motion.div
              initial={{ clipPath: "inset(0 100% 0 0)" }}
              animate={{ clipPath: "inset(0 0% 0 0)" }}
              transition={{ delay: INTRO.wordAt, duration: INTRO.wordLen, ease: EASE.out }}
              className="px-2"
            >
              {wordmark(true)}
            </motion.div>
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: INTRO.statsAt, duration: 0.4, ease: EASE.out }}
              className="flow-source text-text-2"
            >
              <Count to={stats.spaces} delay={INTRO.statsAt} /> spaces, <Count to={stats.scans} delay={INTRO.statsAt} /> 3D scans,{" "}
              <Count to={stats.tenants} delay={INTRO.statsAt} /> past tenants read
            </motion.p>
          </div>
        </div>
      ) : null}
    </motion.div>
  );
}
