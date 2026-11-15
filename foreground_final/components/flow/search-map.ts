import type { RunState } from "@/components/results/use-agent-stream";
import type { RankedSite, SiteNumbers } from "@/lib/agent/events";
import { usd } from "@/lib/format";
import type { FlowSpace } from "./flow-reducer";
import type { MessageOf, SpacePick } from "./types";

/**
 * Pure mapping from the agent's folded run state (use-agent-stream) onto the thread's messages. No React, no
 * time: the same run always gives the same searchProgress view and the same picks.
 */

export type SearchView = Pick<MessageOf<"searchProgress">, "status" | "headline" | "checked" | "total" | "candidates" | "error">;
type Candidate = SearchView["candidates"][number];
export type RunLike = Pick<RunState, "status" | "inspectors" | "decisions" | "ranking" | "plan" | "summary" | "error">;

/** the first sentence of a model's reason, short enough for one line */
export function oneLine(text: string | undefined | null, max = 110): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return "";
  const first = flat.split(/(?<=[.!?])\s/)[0];
  if (first.length <= max) return first;
  const cut = first.slice(0, max).replace(/\s+\S*$/, "");
  return `${cut}…`;
}

export function buildSearchView(run: RunLike, spaces: FlowSpace[]): SearchView {
  const bySite = new Map(Object.values(run.inspectors).map((i) => [i.siteId, i]));
  const dropped = new Map<string, string>();
  for (const d of run.decisions) if (d.action === "drop") dropped.set(d.siteId, d.reason);
  const ranked = new Map((run.ranking ?? []).map((r) => [r.siteId, r]));
  const hasRanking = ranked.size > 0;

  const candidates: Candidate[] = spaces.map((s) => {
    const base = { siteId: s.siteId, photo: s.photo, address: s.address };
    const ins = bySite.get(s.siteId);
    const rank = ranked.get(s.siteId);
    const verdictReason = oneLine(ins?.verdict?.topRisk || ins?.verdict?.headline);

    if (hasRanking) {
      if (rank) return { ...base, state: "kept", reason: oneLine(rank.oneLineReason) };
      if (ins || dropped.has(s.siteId)) {
        return { ...base, state: "rejected", reason: oneLine(dropped.get(s.siteId)) || verdictReason || undefined };
      }
      return { ...base, state: "queued" };
    }
    if (dropped.has(s.siteId)) return { ...base, state: "rejected", reason: oneLine(dropped.get(s.siteId)) };
    if (ins?.status === "done") {
      return ins.verdict?.verdict === "reject"
        ? { ...base, state: "rejected", reason: verdictReason || undefined }
        : { ...base, state: "kept", reason: oneLine(ins.verdict?.headline) || undefined };
    }
    if (ins) return { ...base, state: "inspecting" };
    return { ...base, state: "queued" };
  });

  const checked = candidates.filter((c) => c.state === "kept" || c.state === "rejected").length;
  const total = spaces.length;
  const status: SearchView["status"] = run.status === "done" || run.status === "aborted" ? "done" : run.status === "error" ? "error" : "running";

  let headline: string;
  if (status === "error") headline = "The search stopped before it finished";
  else if (run.status === "aborted") headline = `Stopped after checking ${checked}`;
  else if (status === "done") {
    const n = Math.min(ranked.size, 3);
    headline = n ? `Checked ${checked} spaces, ${n} worth a walk` : `Checked ${checked} spaces, none fit this brief`;
  } else {
    const current = [...candidates].reverse().find((c) => c.state === "inspecting");
    const step = run.plan.find((p) => p.status === "in_progress")?.content;
    headline = current ? `Looking inside ${current.address}` : step ? step : "Looking through every space";
  }
  return { status, headline, checked, total, candidates, ...(status === "error" ? { error: run.error ?? "The connection dropped." } : {}) };
}

function highlightFor(n: SiteNumbers): SpacePick["highlight"] {
  if (n.overBudget === true) return { tone: "needed", text: "Over budget" };
  if (n.overBudget === false && n.breakevenVerdict !== "unlikely") return { tone: "saved", text: "Within budget" };
  if (n.sameSuiteFailures > 0) return { tone: "maybe", text: `${n.sameSuiteFailures} food tenant${n.sameSuiteFailures === 1 ? "" : "s"} left` };
  return undefined;
}

/** Top three of the agent's ranking, in rank order. A ranked site without engine numbers is left out: no number
 *  on a card ever comes from model text. */
export function buildPicks(ranking: RankedSite[] | null, spaces: FlowSpace[]): SpacePick[] {
  const bySpace = new Map(spaces.map((s) => [s.siteId, s]));
  const picks: SpacePick[] = [];
  for (const r of [...(ranking ?? [])].sort((a, b) => a.rank - b.rank)) {
    if (picks.length === 3) break;
    const n = r.numbers;
    if (!n) continue;
    const space = bySpace.get(r.siteId);
    picks.push({
      siteId: r.siteId,
      rank: (picks.length + 1) as 1 | 2 | 3,
      photo: space?.photo ?? "",
      address: n.address || space?.address || "",
      city: n.city || space?.city || "",
      sf: n.sf || space?.sf || 0,
      allInUsd: { low: n.buildoutUsd.low, high: n.buildoutUsd.high },
      reason: oneLine(r.oneLineReason, 140),
      highlight: highlightFor(n),
      hasScan: space?.hasScan ?? false,
    });
  }
  return picks;
}

/**
 * The line shown when a finished search ranked nothing: built from the engine numbers of the spaces the scout
 * looked inside (cheapest all-in against the budget), never from a stock sentence.
 */
export function buildNoFitText(inspectors: RunLike["inspectors"], budgetUsd?: number): string {
  const lows = Object.values(inspectors)
    .map((i) => i.numbers?.buildoutUsd.low)
    .filter((n): n is number => typeof n === "number");
  if (!lows.length) return "None of the spaces fit this brief, and the scout did not get far enough to price any of them.";
  const cheapest = Math.min(...lows);
  if (budgetUsd == null) return `None of the spaces fit this brief. The lowest all-in estimate among the ${lows.length} it priced was ${usd(cheapest)}.`;
  const gap = cheapest - budgetUsd;
  return gap > 0
    ? `None of the spaces fit this brief. The lowest all-in estimate among the ${lows.length} it priced was ${usd(cheapest)}, ${usd(gap)} over your ${usd(budgetUsd)} budget.`
    : `None of the spaces fit this brief. The lowest all-in estimate among the ${lows.length} it priced was ${usd(cheapest)}, inside your ${usd(budgetUsd)} budget, so they were ruled out on other grounds.`;
}
