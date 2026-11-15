"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AnimatePresence, LayoutGroup, motion, MotionConfig, useIsPresent, useReducedMotion } from "motion/react";
import { getReplayQueries, type DealData } from "@/app/flow-actions";
import type { OwnerBrief } from "@/lib/engine";
import { seatCount, type Layout, type Op } from "@/lib/layout";
import { furnitureFor } from "@/lib/three-d/furniture-place";
import { cn } from "@/lib/utils";
import { ChapterRail } from "./chapter-rail";
import { ChapterStage } from "./chapters";
import { BRIGHT_CHAPTERS, chapterForKey, NEXT_PILL, type Chapter } from "./chapter-model";
import { ChatThread } from "./chat-thread";
import { Composer } from "./composer";
import { DealProvider } from "./deal-context";
import { buildExamples, walkSuggestion } from "./examples";
import { FlowContext } from "./flow-context";
import { lastOfKind, pendingClarify, type FlowSpace } from "./flow-reducer";
import { INTRO_KEY, Intro, type IntroStats } from "./intro";
import { DUR, EASE, EXIT_SCALE, REDUCED, SPRING, STAGGER } from "./motion";
import type { RoomHooks } from "./chapters/types";
import { Stage } from "./stage";
import type { FlowAction, SheetSnap, StageProps } from "./types";
import { useAsk } from "./use-ask";
import { useChapterIntro } from "./use-chapter-intro";
import { useDealData } from "./use-deal";
import { useFlow } from "./use-flow";
import { LayoutEditorContext, useLayoutEditorState } from "./use-layout";
import { useSearch } from "./use-search";
import { useWalk } from "./use-walk";

const subscribeWide = (cb: () => void) => {
  const mq = window.matchMedia("(min-width: 640px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const subscribeResize = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};

/** 1440 wide: rail 88, Guide 400, inset 16. 1280 wide: rail 72, Guide 360, inset 12. (docs/deal-flow-plan.md, section 1) */
const SHELL_BIG = { rail: 88, guide: 400, inset: 16 } as const;
const SHELL_SMALL = { rail: 72, guide: 360, inset: 12 } as const;
const HEADER_H = 64;

const HEADLINE = "What are you opening, and where?";

type IntroPhase = "check" | "play" | "rise" | "done";

/** the wordmark: the header's mark and the intro's big one share `layoutId="wordmark"` */
function Wordmark({ big }: { big?: boolean }) {
  return (
    <motion.span
      layoutId="wordmark"
      className={cn("inline-block font-display font-semibold", big && "flow-display-xl")}
      style={big ? { fontSize: "calc(clamp(2.5rem, 5.2vw, 4.75rem) * 1.6)" } : undefined}
    >
      Foreground
    </motion.span>
  );
}

/**
 * The single-route flow (docs/design-v2.md, section 4; docs/deal-flow-plan.md, section 1). Before a space is chosen:
 * a centered conversation (Ask, Clarify, Search, Pick). Once chosen: the chapter rail, the stage and the Guide
 * (the chat panel) in one grid over the pano, which never unmounts.
 */
export function Flow({
  backdrop,
  spaces,
  stats,
}: {
  backdrop: StageProps["backdrop"];
  spaces: FlowSpace[];
  /** counts for the intro line, read from the loaded data */
  stats: IntroStats;
}) {
  const reduce = useReducedMotion();
  const flow = useFlow({ spaces });
  const { state, searchHref } = flow;
  const search = useSearch(state, flow.dispatch);
  const chosenId = lastOfKind(state, "pickCards")?.chosenSiteId;
  const chosen = state.phase === "walk" && chosenId ? (state.spaces.find((s) => s.siteId === chosenId) ?? null) : null;
  const chosenSiteId = chosen?.siteId ?? null;
  const deal = useDealData(chosenSiteId, state.brief);
  const walkData = deal.status === "ready" ? (deal.data?.walk ?? null) : undefined;
  const walk = useWalk(state, flow.dispatch, chosenSiteId, walkData);
  const offerBrief = useMemo(
    // the plan's concept and seats once there is a plan (Ask answers and offers read the plan the owner drew)
    () => (state.brief ? { concept: state.layout?.concept ?? state.brief.concept, seats: state.layout ? seatCount(state.layout) : state.brief.seats, budgetUsd: state.brief.budgetUsd } : null),
    [state.brief, state.layout],
  );
  const asker = useAsk(flow.dispatch, chosenSiteId, offerBrief);
  const wide = useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia("(min-width: 640px)").matches,
    () => true,
  );
  const bigShell = useSyncExternalStore(
    subscribeResize,
    () => window.innerWidth >= 1360,
    () => true,
  );
  const shell = bigShell ? SHELL_BIG : SHELL_SMALL;
  const [snapPick, setSnapPick] = useState<{ phase: string; snap: SheetSnap } | null>(null);
  const snap: SheetSnap = snapPick?.phase === state.phase ? snapPick.snap : state.phase === "walk" ? "peek" : "full";
  const chapter = state.chapter;
  const inWalk = chapter === "walk";

  // the intro: plays once per tab, never under reduced motion; ?intro=0 skips it (automated checks)
  const [introPhase, setIntroPhase] = useState<IntroPhase>("check");
  // decided once: React's dev double-run of effects must not read the flag this run just wrote
  const introDecided = useRef(false);
  useEffect(() => {
    if (introDecided.current || reduce === null) return;
    introDecided.current = true;
    let seen = false;
    try {
      seen = sessionStorage.getItem(INTRO_KEY) === "1" || new URLSearchParams(window.location.search).get("intro") === "0";
      sessionStorage.setItem(INTRO_KEY, "1");
    } catch {
      /* storage blocked: play it, it is short */
    }
    const next: IntroPhase = reduce || seen ? "done" : "play";
    queueMicrotask(() => setIntroPhase(next));
  }, [reduce]);
  const introRisen = introPhase === "rise" || introPhase === "done";

  const changeChapter = useCallback(
    (c: Chapter) => flow.dispatch({ type: "chapter", chapter: c, at: Date.now() }),
    [flow],
  );

  const onAction = useCallback(
    (a: FlowAction) => {
      if (a.type === "stop") search.stop();
      else if (a.type === "retrySearch") search.retry();
      else if (a.type === "chapter") changeChapter(a.chapter);
      else if (a.type === "walkGo") {
        // the last stop's "See the business" leaves the walk for the numbers
        if (a.index >= walk.total) changeChapter("numbers");
        else walk.go(a.index);
      } else if (a.type === "holdBefore") walk.hold(a.held);
      else flow.onAction(a);
    },
    [flow, search, walk, changeChapter],
  );

  // the plan arrives with the deal; chapters read it from DealContext
  const planFor = useRef<string | null>(null);
  const dealData = deal.data;
  useEffect(() => {
    if (!dealData || planFor.current === dealData.site.id) return;
    planFor.current = dealData.site.id;
    flow.dispatch({ type: "layoutReady", layout: dealData.layout });
  }, [dealData, flow]);
  useEffect(() => {
    if (!chosenSiteId) planFor.current = null;
  }, [chosenSiteId]);

  // the Deal finale: the stage lifts its scrim and glides through the space, slowly turning
  const [finale, setFinale] = useState(false);
  const finaleOn = finale && chapter === "deal";
  const viewer = walk.viewerRef;
  useEffect(() => {
    const v = viewer.current;
    if (!finaleOn || !v || !dealData) return;
    const front = dealData.site.findings.find((f) => f.kind === "storefront");
    const panos = dealData.walk?.site.matterport.panos ?? [];
    const target = (front?.panoId && panos.find((p) => p.id === front.panoId)?.id) || panos[0]?.id;
    if (target && v.panoId() !== target) v.goTo(target);
    if (front?.position) v.lookAt(front.position, target);
    v.autoPan(0.06);
    return () => v.autoPan(0);
  }, [finaleOn, dealData, viewer]);
  const restart = useCallback(() => {
    setFinale(false);
    flow.dispatch({ type: "reset" });
  }, [flow]);

  // each chapter's first Guide line, built from the same payload as the stage
  useChapterIntro(state, flow.dispatch, dealData, state.brief);

  // keys 1-6 and [ ] move between chapters (not while typing)
  useEffect(() => {
    if (!chosen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const next = chapterForKey(e.key, chapter);
      if (next && next !== chapter) {
        e.preventDefault();
        changeChapter(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chosen, chapter, changeChapter]);

  // the Layout chapter's editing state: pointer edits, typed instructions, undo (flow-reducer holds the history)
  const planBrief = useMemo(() => (dealData && state.brief ? { ...state.brief, city: dealData.site.city } : null), [dealData, state.brief]);
  const editor = useLayoutEditorState({
    dispatch: flow.dispatch,
    layout: state.layout,
    suggested: dealData?.layout ?? null,
    past: state.past.length,
    future: state.future.length,
    site: dealData?.site ?? null,
    brief: planBrief,
  });

  const [draft, setDraft] = useState("");
  const asking = state.phase === "ask";
  const clarifying = pendingClarify(state) !== null;
  const compact = Boolean(chosen) && !wide && snap === "peek";
  const context = useMemo(
    () => ({ searchHref, brief: offerBrief, compact }),
    [searchHref, offerBrief, compact],
  );
  // ?replay=1: the chips are the recorded briefs exactly, so the recorded run matches what was typed. Live mode builds them from the loaded spaces.
  const [recorded, setRecorded] = useState<string[]>([]);
  useEffect(() => {
    if (!search.replay) return;
    let live = true;
    getReplayQueries().then((q) => live && setRecorded(q), () => {});
    return () => {
      live = false;
    };
  }, [search.replay]);
  const examples = useMemo(() => (search.replay ? recorded : buildExamples(spaces.map((s) => s.city))), [search.replay, recorded, spaces]);
  const stop = walk.data?.stops[walk.index];
  const roomChange = chapter === "walk" || chapter === "room";

  const submit = (text: string) => {
    if (chosen) {
      if (chapter === "layout") void editor.instruct(text);
      else if (roomChange) walk.imagineText(text);
      else void asker.ask(text);
    } else {
      onAction({ type: "send", text });
      // a typed line that answers no question: say where things stand, in words that match the state
      if (!asking && !clarifying) {
        const reply =
          state.phase === "pick"
            ? "Pick one of the spaces above and I can answer questions about it."
            : "I am still checking the spaces. Ask again once they are ranked.";
        flow.dispatch({ type: "append", at: Date.now() + 1, message: { kind: "assistantText", text: reply, streaming: false } });
      }
    }
    setDraft("");
  };

  // Room: the owner's plan as 3D pieces in the scan. Without a plan in the scan's frame (no exact-suite scan) the Room is a plan view over the dimmed pano.
  const furnitureBase = useMemo(() => (dealData && state.layout ? furnitureFor(dealData.site, state.layout) : null), [dealData, state.layout]);
  const [roomDrag, setRoomDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const roomOn = (chapter === "room" || finaleOn) && furnitureBase !== null;
  const furniture = useMemo(
    () => (!roomOn || !furnitureBase ? null : roomDrag ? { ...furnitureBase, items: furnitureBase.items.map((i) => (i.id === roomDrag.id ? { ...i, x: roomDrag.x, y: roomDrag.y } : i)) } : furnitureBase),
    [roomOn, furnitureBase, roomDrag],
  );
  const grid = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("grid") === "1",
    () => false,
  );
  // an AI render only shows in the Room once the owner asked for one there
  const [renderAsked, setRenderAsked] = useState(false);
  const roomImagined = chapter === "room" && !renderAsked ? null : walk.imagined;
  const roomFallback = chapter === "room" && Boolean(dealData) && furnitureBase === null;
  const roomHooks: RoomHooks = useMemo(
    () => ({
      viewer: walk.viewerRef,
      onDrag: setRoomDrag,
      render: (instruction: string, shown: string) => {
        setRenderAsked(true);
        walk.hold(false);
        walk.imagineText(instruction, shown);
      },
      rendering: walk.working,
      rendered: renderAsked && Boolean(walk.imagined),
      before: walk.showBefore,
      setBefore: walk.hold,
    }),
    [walk, renderAsked],
  );

  const mode: StageProps["mode"] = chosen ? ((BRIGHT_CHAPTERS.has(chapter) && !roomFallback) || finaleOn ? "space" : "spaceDim") : "backdrop";
  const next = NEXT_PILL[chapter];
  const leftInset = shell.inset * 2 + shell.rail;
  const rightInset = shell.inset * 2 + shell.guide;

  const nextPill = next ? (
    <motion.button
      key={next.to}
      type="button"
      onClick={() => changeChapter(next.to)}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.97, transition: { duration: DUR.press } }}
      transition={reduce ? REDUCED : SPRING.ui}
      className="mb-3 inline-flex h-12 w-full items-center justify-center rounded-full bg-text px-6 text-[0.9375rem] font-semibold text-stage outline-none focus-visible:ring-2 focus-visible:ring-live"
    >
      {next.label}
    </motion.button>
  ) : null;

  return (
    <MotionConfig reducedMotion="user" transition={SPRING.ui}>
      <LayoutGroup id="flow">
        <FlowContext.Provider value={context}>
          <main className="flow fixed inset-0 overflow-hidden">
            <Stage
              mode={mode}
              backdrop={backdrop}
              dim={!asking}
              site={chosen ? (walk.data?.site ?? { id: chosen.siteId, address: chosen.address }) : undefined}
              poster={chosen?.photo}
              viewerRef={walk.viewerRef}
              focus={inWalk ? walk.focus : undefined}
              imagined={roomImagined}
              showBefore={walk.showBefore}
              furniture={furniture}
              empty={roomOn}
              grid={grid}
              working={walk.working}
              header={chosen ? { address: chosen.address, rentLabel: walk.data?.rentLabel ?? "" } : undefined}
              tour={inWalk && walk.total ? { index: walk.index, total: walk.total } : undefined}
              rightInset={chosen && wide ? rightInset : 0}
              leftInset={chosen && wide ? leftInset : 0}
              onPano={walk.onPano}
              onAction={onAction}
            />

            <header className="absolute inset-x-0 top-0 z-20 flex h-14 items-center justify-between px-4 sm:h-16 sm:px-8">
              <button
                type="button"
                onClick={() => {
                  setDraft("");
                  flow.dispatch({ type: "reset" });
                }}
                aria-label="Foreground, start over"
                className="flow-title rounded-f-sm font-display font-semibold text-text transition-transform duration-100 active:scale-[0.97]"
              >
                {introRisen ? <Wordmark /> : <span className="inline-block opacity-0">Foreground</span>}
              </button>
              <div className="flex items-center gap-3">
                {search.replay ? (
                  <span
                    className="glass flow-label inline-flex h-8 max-w-[420px] items-center rounded-full px-3 text-text"
                    title={search.recordedQuery ? `Recorded run of: ${search.recordedQuery}` : "Recorded run: no model is called"}
                  >
                    <span className="truncate">Recorded run{search.recordedQuery ? `: ${search.recordedQuery}` : ""}</span>
                  </span>
                ) : null}
                {chosen || !searchHref ? null : (
                  <Link
                    href={searchHref}
                    className="-mr-2 inline-flex h-11 items-center rounded-full px-2 text-sm text-text-2 transition-colors duration-150 hover:text-text"
                  >
                    Details
                  </Link>
                )}
              </div>
            </header>

            <AnimatePresence>
              {asking && introRisen ? (
                <Ask key="ask">
                  <Composer
                    variant="hero"
                    value={draft}
                    onChange={setDraft}
                    onSubmit={submit}
                    placeholder="Concept, seats, budget, city"
                    examples={examples}
                    autoFocus
                  />
                </Ask>
              ) : null}
            </AnimatePresence>

            {chosen ? (
              <>
                <h1 className="sr-only">Walking {chosen.address}</h1>
                <LayoutEditorContext.Provider value={editor}>
                <MaybeDeal data={dealData} brief={state.brief} layout={state.layout} opLog={state.opLog}>
                <div
                  className="pointer-events-none absolute inset-0 z-10 grid"
                  style={
                    wide
                      ? {
                          gridTemplateColumns: `${shell.rail}px minmax(0, 1fr) ${shell.guide}px`,
                          gap: shell.inset,
                          padding: `${HEADER_H}px ${shell.inset}px ${shell.inset}px`,
                        }
                      : undefined
                  }
                >
                  {wide ? (
                    <div className="pointer-events-auto min-h-0">
                      <ChapterRail current={chapter} visited={state.visited} onSelect={changeChapter} />
                    </div>
                  ) : null}
                  {wide ? (
                    <ChapterStage chapter={chapter} status={deal.status} onRetry={deal.retry} onChapter={changeChapter} onFinale={setFinale} onRestart={restart} room={roomHooks} />
                  ) : null}
                  <div className={cn("pointer-events-auto min-h-0", !wide && "contents")}>
                    <ChatThread
                      messages={state.messages.filter((m) => m.kind !== "pickCards" && m.kind !== "searchProgress" && m.kind !== "clarifyChips" && !(m.kind === "assistantText" && m.at < (lastOfKind(state, "pickCards")?.at ?? 0)) && !(m.kind === "user" && m.at < (lastOfKind(state, "pickCards")?.at ?? 0)))}
                      phase={state.phase}
                      onAction={onAction}
                      layout={wide ? "panel" : "sheet"}
                      sheetSnap={snap}
                      onSheetSnap={(s) => setSnapPick({ phase: state.phase, snap: s })}
                      composer={
                        <>
                          {nextPill}
                          <Composer
                            variant="docked"
                            value={draft}
                            onChange={setDraft}
                            onSubmit={submit}
                            placeholder={chapter === "layout" ? "Change the plan: add a patio" : roomChange ? "Describe a change to this room" : "Ask about this space"}
                            suggestions={inWalk ? walkSuggestion(stop?.pin, stop?.title) : undefined}
                            busy={asker.asking}
                            onStop={asker.stop}
                          />
                        </>
                      }
                    />
                  </div>
                </div>
                </MaybeDeal>
                </LayoutEditorContext.Provider>
              </>
            ) : null}

            {!asking && !chosen ? (
              <>
                <h1 className="sr-only">Finding your space</h1>
                <ChatThread
                  messages={state.phase === "pick" ? state.messages.filter((m) => m.kind === "searchProgress" || m.kind === "pickCards") : state.messages}
                  phase={state.phase}
                  onAction={onAction}
                  layout="center"
                  composer={
                    <Composer
                      variant="docked"
                      value={draft}
                      onChange={setDraft}
                      onSubmit={submit}
                      placeholder={clarifying ? "Or type your own answer" : "Ask about these spaces"}
                      busy={search.running}
                      onStop={search.stop}
                      autoFocus
                    />
                  }
                />
              </>
            ) : null}

            {introPhase === "play" || introPhase === "rise" ? (
              <Intro
                photos={backdrop}
                stats={stats}
                wordmark={(big) => <Wordmark big={big} />}
                onRise={() => setIntroPhase("rise")}
                onDone={() => setIntroPhase("done")}
              />
            ) : null}
          </main>
        </FlowContext.Provider>
      </LayoutGroup>
    </MotionConfig>
  );
}

/** provides the shared deal to the chapters once the site, brief and plan are all there */
function MaybeDeal({
  data,
  brief,
  layout,
  opLog,
  children,
}: {
  data: DealData | null;
  brief: OwnerBrief | null;
  layout: Layout | null;
  opLog: Op[];
  children: React.ReactNode;
}) {
  const withCity = useMemo(() => (data && brief ? { ...brief, city: data.site.city } : null), [data, brief]);
  if (!data || !withCity || !layout) return <>{children}</>;
  return (
    <DealProvider site={data.site} brief={withCity} layout={layout} opLog={opLog}>
      {children}
    </DealProvider>
  );
}

/** The Ask landing: one headline, the hero composer, the examples. Nothing else. */
function Ask({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const present = useIsPresent();
  const word = reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        hidden: { opacity: 0, y: "0.45em", filter: "blur(8px)" },
        show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: EASE.out } },
        exit: { opacity: 0, y: -24, filter: "blur(6px)", transition: { duration: 0.4 * EXIT_SCALE, ease: EASE.out } },
      };

  return (
    <motion.div
      initial="hidden"
      animate="show"
      exit="exit"
      variants={{ show: { transition: { staggerChildren: reduce ? 0 : STAGGER } }, exit: { transition: { duration: DUR.state } } }}
      className={cn(
        "absolute inset-0 z-10 flex flex-col px-4 pt-[120px] pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8 sm:pt-[34vh] sm:pb-0",
        !present && "pointer-events-none",
      )}
    >
      <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col sm:flex-none">
        <h1 aria-label={HEADLINE} className="flow-headline text-balance text-text">
          {HEADLINE.split(" ").map((w, i) => (
            <span key={i} aria-hidden="true" className="inline-block whitespace-pre">
              <motion.span variants={word} className="inline-block">
                {w}
              </motion.span>{" "}
            </span>
          ))}
        </h1>
        <div className="mt-auto sm:mt-8">{children}</div>
      </div>
    </motion.div>
  );
}
