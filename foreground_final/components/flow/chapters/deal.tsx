"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { buildAskList } from "@/lib/outputs/ask-list";
import { buildMemo } from "@/lib/outputs/memo";
import { Card } from "../card";
import { useDeal } from "../deal-context";
import { AskList } from "../deal/asks";
import { checkedIds, nextSteps, sealLine } from "../deal/data";
import { Finale } from "../deal/finale";
import { EMPTY_LETTER, useLetter, type LetterState } from "../deal/letter";
import { LetterDoc } from "../deal/letter-doc";
import { MemoPreview } from "../deal/memo-preview";
import { NextSteps } from "../deal/next-steps";
import { DUR, REDUCED, SPRING } from "../motion";
import { memoHref } from "../outlook-data";
import { ChapterFrame } from "./chapter-frame";
import type { ChapterProps } from "./types";

/** what the owner did here survives a trip to another chapter and back (per space, for this tab) */
const keep = new Map<string, { letter: LetterState; unchecked: string[] }>();

/**
 * Chapter 6: the close. Three documents on a table (your asks, the offer letter, the deal memo), the timeline of
 * next steps under them, and one bone pill: draft the letter, then copy it. Copying plays the finale.
 */
export function DealChapter({ status, onRetry, onFinale, onRestart }: ChapterProps) {
  const deal = useDeal();
  if (!deal) return <ChapterFrame step={6} title="Deal" lede="Reading the asks for this space." will={[]} live={null} status={status} onRetry={onRetry} />;
  return <DealTable key={deal.site.id} deal={deal} onFinale={onFinale} onRestart={onRestart} />;
}

function DealTable({ deal, onFinale, onRestart }: { deal: NonNullable<ReturnType<typeof useDeal>>; onFinale: (on: boolean) => void; onRestart: () => void }) {
  const reduce = useReducedMotion();
  const { site, brief, layout, impact, assessment } = deal;
  const saved = keep.get(site.id);
  const [unchecked, setUnchecked] = useState<Set<string>>(() => new Set(saved?.unchecked ?? []));
  const [finale, setFinale] = useState(false);
  const [copied, setCopied] = useState(true);
  const unmounted = useRef(false);

  const asks = useMemo(() => buildAskList(site, impact.analysis), [site, impact.analysis]);
  const ids = useMemo(() => checkedIds(asks, unchecked), [asks, unchecked]);
  const askKey = ids.join(",");
  const planBrief = useMemo(() => ({ ...brief, concept: layout.concept, seats: impact.seats }), [brief, layout.concept, impact.seats]);
  const memo = useMemo(() => buildMemo(site, impact.analysis, asks, planBrief), [site, impact.analysis, asks, planBrief]);
  const memoLink = memoHref(site.id, planBrief);
  const steps = useMemo(() => nextSteps(assessment, impact.analysis.timeToOpen), [assessment, impact.analysis.timeToOpen]);

  const onLetter = useCallback(
    (l: LetterState) => {
      keep.set(site.id, { letter: l, unchecked: [...(keep.get(site.id)?.unchecked ?? [])] });
    },
    [site.id],
  );
  const { letter, shown, draft, edit } = useLetter(saved?.letter ?? EMPTY_LETTER, onLetter);

  const startDraft = useCallback(
    () =>
      void draft({
        siteId: site.id,
        brief: { concept: layout.concept, seats: impact.seats, budgetUsd: brief.budgetUsd },
        seats: Math.max(8, impact.seats),
        askIds: ids,
      }),
    [draft, site.id, layout.concept, impact.seats, brief.budgetUsd, ids],
  );

  const toggle = (id: string) =>
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      keep.set(site.id, { letter: keep.get(site.id)?.letter ?? letter, unchecked: [...next] });
      return next;
    });

  // a letter that exists and has not been edited follows the checked asks (debounced); an edited one asks first
  const outOfDate = letter.status !== "idle" && letter.askKey !== askKey;
  useEffect(() => {
    if (!outOfDate || letter.edited || letter.status === "streaming" || ids.length === 0) return;
    const t = setTimeout(startDraft, 700);
    return () => clearTimeout(t);
  }, [outOfDate, letter.edited, letter.status, ids.length, startDraft]);

  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
      onFinale(false);
    };
  }, [onFinale]);

  const ready = letter.status === "ready" && letter.text.trim().length > 0;
  const pillLabel = letter.status === "streaming" ? "Drafting the letter" : ready ? "Copy the offer" : "Draft the offer letter";

  async function press() {
    if (!ready) {
      if (letter.status !== "streaming" && ids.length > 0) startDraft();
      return;
    }
    let ok = true;
    try {
      await navigator.clipboard.writeText(letter.text);
    } catch {
      ok = false;
    }
    if (unmounted.current) return;
    setCopied(ok);
    setFinale(true);
    onFinale(true);
  }
  const back = () => {
    setFinale(false);
    onFinale(false);
  };

  const seal = sealLine({ address: site.address, seats: impact.seats, total: impact.total, timeToOpen: impact.analysis.timeToOpen });
  const subject = `${site.address}${site.space.suite ? `, Suite ${site.space.suite}` : ""}: offer and questions`;

  return (
    <section aria-label="The deal" className="pointer-events-none relative h-full min-h-0">
      <AnimatePresence mode="wait" initial>
        {finale ? (
          <motion.div key="finale" className="absolute inset-0" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Finale seal={seal} subject={subject} body={letter.text} memoHref={memoLink} copied={copied} onBack={back} onRestart={onRestart} />
          </motion.div>
        ) : (
          <motion.div
            key="table"
            className="absolute inset-0 flex flex-col gap-3 pt-14"
            exit={reduce ? { opacity: 0, transition: REDUCED } : { opacity: 0, scale: 0.96, y: 24, transition: { duration: DUR.state } }}
          >
            <div className="grid min-h-0 flex-1 grid-cols-[1fr_1.25fr_1fr] gap-3">
              <Card title="Your asks" source="Foreground ask list: X-Ray, time-to-open, break-even, fair-rent model" rotate={-1.5} delay={0} aside={<span className="flow-label text-text-3">{ids.length} of {asks.length} in the letter</span>}>
                <AskList asks={asks} unchecked={unchecked} onToggle={toggle} />
              </Card>
              <Card title="The offer letter" source={`POST /api/offer, ${impact.seats} seats, ${ids.length} asks`} rotate={0} delay={0.12}>
                <LetterDoc letter={letter} shown={shown} onEdit={edit} onDraft={startDraft} outOfDate={outOfDate} disabled={ids.length === 0} />
              </Card>
              <Card title="The deal memo" source="Foreground deal memo" rotate={1.5} delay={0.24}>
                <MemoPreview memo={memo} href={memoLink} />
              </Card>
            </div>
            <Card title="Next steps" source={`Permits: ${assessment.codeBasis}. Weeks to open: Foreground time-to-open estimate`} index={3} className="h-[118px] shrink-0">
              <NextSteps steps={steps} />
            </Card>
            <div className="pointer-events-auto flex shrink-0 justify-center">
              <motion.button
                type="button"
                onClick={() => void press()}
                disabled={letter.status === "streaming" || (!ready && ids.length === 0)}
                whileTap={{ scale: 0.97, transition: { duration: DUR.press } }}
                transition={SPRING.ui}
                className="inline-flex h-12 items-center rounded-full bg-text px-7 text-[0.9375rem] font-semibold text-stage outline-none focus-visible:ring-2 focus-visible:ring-live disabled:opacity-60"
              >
                {pillLabel}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
