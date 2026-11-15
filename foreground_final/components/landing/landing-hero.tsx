"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { CityPlat } from "./city-map";
import { fits, projectCity, readDraft, type MapSite } from "./geo";

const EXAMPLES = [
  "Fast-casual taqueria, 40 seats, $250k, Houston",
  "Full-service Italian, 60 seats, $300k, Los Angeles",
  "Specialty coffee cafe, 25 seats, $120k, Los Angeles",
];

const SWEEP_MS = 760;
const SEEN_KEY = "foreground.seen";
const BRIEF_KEY = "foreground.lastBrief";

/** localStorage read that is safe in private windows and during prerender (null on the server). */
function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStore(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the landing still works, it just replays the intro */
  }
}
const noSubscribe = () => () => {};
// read once per page load, so marking the intro as seen mid-visit does not cut the running intro
let seenCache: boolean | undefined;
const seenAtLoad = () => (seenCache ??= readStore(SEEN_KEY) === "1");
const RM = "(prefers-reduced-motion: reduce)";
function subscribeRM(cb: () => void) {
  const m = window.matchMedia(RM);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

export function LandingHero({ sites }: { sites: MapSite[] }) {
  const router = useRouter();
  // read through useSyncExternalStore so hydration matches the server render, then settles on the real value
  const reduce = useSyncExternalStore(subscribeRM, () => window.matchMedia(RM).matches, () => false);
  // "The city wakes up" plays on the first visit; later visits go straight to the input with the last brief
  const seen = useSyncExternalStore(noSubscribe, seenAtLoad, () => false);
  const lastBrief = useSyncExternalStore(noSubscribe, () => readStore(BRIEF_KEY), () => null);
  const [edited, setText] = useState<string | null>(null);
  const text = edited ?? lastBrief ?? "";
  const intro = !reduce && !seen;
  useEffect(() => {
    if (seen) inputRef.current?.focus();
  }, [seen]);
  const [leaving, setLeaving] = useState<null | { city?: MapSite["city"] }>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const houston = useMemo(() => projectCity("Houston", sites), [sites]);
  const la = useMemo(() => projectCity("Los Angeles", sites), [sites]);
  const draft = useMemo(() => readDraft(text), [text]);
  const typing = text.trim().length > 0;
  const lit = useMemo(() => new Set(sites.filter((s) => fits(s, draft)).map((s) => s.id)), [sites, draft]);

  function go(query: string) {
    const q = query.trim();
    if (q.length < 3) {
      inputRef.current?.focus();
      return;
    }
    const href = `/search?${new URLSearchParams({ q })}`;
    writeStore(BRIEF_KEY, q);
    // the intro has done its job once the owner has run a search
    const firstRun = !seen;
    writeStore(SEEN_KEY, "1");
    router.prefetch(href);
    if (reduce || !firstRun) {
      router.push(href);
      return;
    }
    // the scan line sweeps the city while the camera eases toward it, then we hand over
    setLeaving({ city: readDraft(q).city });
    window.setTimeout(() => {
      router.push(href);
      seenCache = true; // coming back to / in this visit skips the intro
    }, SWEEP_MS);
  }

  const focusOf = (city: MapSite["city"]) => (!leaving ? "none" : !leaving.city || leaving.city === city ? "in" : "out");

  return (
    <section className="relative overflow-hidden bg-ink text-on-ink" aria-labelledby="hero-h">
      <div className="mx-auto flex min-h-[100svh] max-w-[90rem] flex-col px-4 sm:px-8">
        <div className="relative z-10 flex items-center justify-between border-b border-on-ink/20 py-3 text-sm">
          <span className="lettering-wide text-[0.8125rem] font-bold">Foreground</span>
          <a href="#sites" className="text-on-ink-2 hover:text-on-ink hover:underline">
            Browse all {sites.length} spaces
          </a>
        </div>

        <div className="grid flex-1 items-center gap-x-10 gap-y-6 py-8 lg:grid-cols-12 lg:py-10">
          <div className="relative z-10 flex flex-col gap-6 lg:col-span-5">
            <motion.h1
              id="hero-h"
              className="lettering text-[3rem] font-bold leading-[0.92] sm:text-[4.25rem] xl:text-[5rem]"
              key={intro ? "intro" : "still"}
              initial={intro ? { opacity: 0, y: 12 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            >
              What are you opening?
            </motion.h1>
            <p className="max-w-lg text-lg leading-snug text-on-ink-2">
              Foreground looks <span className="font-semibold text-on-ink">inside</span> the space, from{" "}
              <span className="font-semibold text-on-ink">above</span> and into the <span className="font-semibold text-on-ink">market</span>,
              then tells you what it will really cost to become your restaurant, before you sign.
            </p>

            <form
              role="search"
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                go(text);
              }}
              action="/search"
            >
              <label htmlFor="q" className="sr-only">
                Describe your restaurant: concept, seats, budget, city
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  ref={inputRef}
                  id="q"
                  name="q"
                  type="text"
                  required
                  minLength={3}
                  maxLength={500}
                  autoComplete="off"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Taqueria, 40 seats, $250k, Houston"
                  aria-describedby="fit-count"
                  className="h-14 w-full min-w-0 rounded-sm sm:h-16 sm:flex-1 border border-on-ink/40 bg-paper px-4 text-lg text-ink placeholder:text-ink-2 focus-visible:border-paper sm:text-xl"
                />
                <button
                  type="submit"
                  disabled={Boolean(leaving)}
                  className="flex h-14 items-center justify-center gap-2 rounded-sm border border-paper bg-paper px-6 text-lg font-semibold text-ink transition-[transform,background-color] duration-150 hover:bg-on-ink-2 active:scale-[0.97] disabled:opacity-70 sm:h-16"
                >
                  Find my space
                  <ArrowRight aria-hidden className="size-5" />
                </button>
              </div>
              <p id="fit-count" aria-live="polite" className="min-h-5 text-sm text-on-ink-2">
                {typing ? (
                  <>
                    <span className="font-semibold text-maybe">{lit.size}</span> of {sites.length} spaces fit what you typed
                    {draft.city ? ` in ${draft.city}` : ""}
                    {draft.seats ? `, ${draft.seats}+ seats` : ""}
                  </>
                ) : (
                  `${sites.length} available food-ready spaces in Houston and Los Angeles`
                )}
              </p>
            </form>

            <div className="flex flex-col gap-2">
              <p className="text-sm text-on-ink-2">Or try one:</p>
              <ul className="flex flex-wrap gap-2">
                {EXAMPLES.map((q) => (
                  <li key={q}>
                    <button
                      type="button"
                      onClick={() => {
                        setText(q);
                        go(q);
                      }}
                      className="inline-flex min-h-11 items-center rounded-sm border border-on-ink/30 px-3 py-2 text-left text-sm transition-[border-color,background-color,transform] duration-150 hover:border-on-ink hover:bg-on-ink/10 active:scale-[0.98]"
                    >
                      {q}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="relative lg:col-span-7" aria-label="The 12 spaces, surveyed">
            <div className="grid grid-cols-2 gap-4 sm:gap-8">
              <CityPlat key={`h-${intro}`} panel={houston} lit={lit} typing={typing} intro={intro} focus={focusOf("Houston")} />
              <CityPlat key={`l-${intro}`} panel={la} lit={lit} typing={typing} intro={intro} focus={focusOf("Los Angeles")} />
            </div>
            <AnimatePresence>
              {leaving && !reduce ? (
                <motion.div
                  key="sweep"
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-0 w-full"
                  initial={{ x: "-10%" }}
                  animate={{ x: "105%" }}
                  transition={{ duration: SWEEP_MS / 1000, ease: [0.65, 0, 0.35, 1] }}
                >
                  <div className="h-full w-0.5 bg-maybe" />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>

        <p className="relative z-10 pb-4 font-mono text-[0.6875rem] text-on-ink-2">
          src CoStar listings · schematic plat: close sites spread for legibility, bearings and distances true ·{" "}
          <Link href="#sites" className="underline hover:text-on-ink">
            list view
          </Link>
        </p>
      </div>
    </section>
  );
}
