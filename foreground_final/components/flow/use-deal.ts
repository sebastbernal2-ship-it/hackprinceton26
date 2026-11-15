"use client";

import { useCallback, useEffect, useState } from "react";
import { getDeal, type DealData } from "@/app/flow-actions";
import type { OwnerBrief } from "@/lib/engine";

type Load = { key: string; result: { ok: true; data: DealData } | { ok: false } } | null;

/**
 * Fetches the shared deal state once per chosen space (server action `getDeal`). `status` is "idle" with no space,
 * "loading" until it answers, "error" if it failed (the chapters say so and offer Retry).
 */
export function useDealData(siteId: string | null, brief: OwnerBrief | null) {
  const [load, setLoad] = useState<Load>(null);
  const [attempt, setAttempt] = useState(0);
  const key = siteId && brief ? `${siteId}:${attempt}` : null;

  useEffect(() => {
    if (!siteId || !brief || !key) return;
    let live = true;
    getDeal(siteId, { concept: brief.concept, seats: brief.seats, budgetUsd: brief.budgetUsd })
      .then((data) => live && setLoad({ key, result: data ? { ok: true, data } : { ok: false } }))
      .catch(() => live && setLoad({ key, result: { ok: false } }));
    return () => {
      live = false;
    };
    // the brief does not change while a space is open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const mine = key && load?.key === key ? load.result : null;
  const status = !key ? ("idle" as const) : !mine ? ("loading" as const) : mine.ok ? ("ready" as const) : ("error" as const);
  return { status, data: mine?.ok ? mine.data : null, retry };
}
