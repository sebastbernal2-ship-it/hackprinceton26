import type { Concept } from "./reskin";

export type ChangeKind = "reskin" | "wall" | "other";
export type ParsedChange = { kind: ChangeKind; toConcept?: string; text: string };

const WORDS: Record<string, string[]> = {
  indian: ["indian", "tandoor", "curry"],
  mexican: ["mexican", "taqueria", "taco"],
  japanese: ["japanese", "sushi", "ramen", "izakaya"],
  diner: ["diner"],
  coffee_bakery: ["coffee", "bakery", "cafe", "café"],
  italian: ["italian", "pizza", "pasta", "trattoria"],
};

/** Deterministic keyword routing. This is a local router, not a model: unmatched text stays "other". */
export function parseChange(text: string, concepts: Concept[]): ParsedChange {
  const t = text.toLowerCase();
  const ids = new Set(concepts.map((c) => c.id));
  const wall = /\b(open|remove|knock|take down|combine|merge|expand)\b.*\b(wall|room|suite|space)\b/.test(t);
  if (wall) return { kind: "wall", text };
  if (/\b(turn|convert|change|make|reskin|rebrand|swap)\b|into|to a|to an/.test(t)) {
    // the LAST concept mentioned is the target ("turn this Italian restaurant into Indian")
    let best: { id: string; at: number } | null = null;
    for (const [id, ws] of Object.entries(WORDS)) {
      if (!ids.has(id)) continue;
      for (const w of ws) {
        const at = t.lastIndexOf(w);
        if (at >= 0 && (!best || at > best.at)) best = { id, at };
      }
    }
    if (best) return { kind: "reskin", toConcept: best.id, text };
  }
  return { kind: "other", text };
}

export type AgentEvent = { type: string; mode?: string; [k: string]: unknown };
export type AgentMode = "LIVE" | "SCRIPTED" | "REPLAY" | "STUB";

/** Parse a `text/event-stream` chunk buffer into events; returns the unconsumed tail. */
export function parseSse(buffer: string): { events: AgentEvent[]; rest: string } {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: AgentEvent[] = [];
  for (const p of parts) {
    const data = p.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
    if (!data) continue;
    try {
      events.push(JSON.parse(data) as AgentEvent);
    } catch {
      /* a malformed event is dropped, not repaired */
    }
  }
  return { events, rest };
}

async function stream(url: string, init: RequestInit | undefined, onEvent: (e: AgentEvent) => void, signal?: AbortSignal) {
  const r = await fetch(url, { ...init, signal });
  if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const { events, rest } = parseSse(buf);
    buf = rest;
    events.forEach(onEvent);
  }
}

/**
 * Route the free-text change to the agent endpoint (POST /api/agent/run). If the agent answers only with an error
 * (e.g. no CoStar data loaded) fall back to GET /api/agent/replay, labelled REPLAY. If the API is unreachable the
 * caller shows a labelled STUB. Returns the mode that produced events, or "STUB".
 */
export async function runAgent(goal: string, onEvent: (e: AgentEvent) => void, signal?: AbortSignal): Promise<AgentMode> {
  let got = 0;
  let errored = false;
  let mode: AgentMode = "SCRIPTED";
  try {
    await stream("/api/agent/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ goal }) }, (e) => {
      if (e.type === "error") errored = true;
      else { got += 1; if (got === 1 && (e.mode === "LIVE" || e.mode === "SCRIPTED")) mode = e.mode; onEvent(e); }
    }, signal);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    errored = true;
  }
  if (got > 0 && !errored) return mode;
  try {
    let replayed = 0;
    await stream("/api/agent/replay?delay=0.05", undefined, (e) => { if (e.type !== "error") { replayed += 1; onEvent(e); } }, signal);
    if (replayed > 0) return "REPLAY";
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
  }
  return "STUB";
}

/**
 * Things a person should check before committing to a change of this kind. This is a TO-VERIFY list, not a set of
 * findings: no item has a source here, every status is "unverified", and none states a code requirement.
 */
export const VERIFY_TOPICS: { id: string; topic: string; ask: string }[] = [
  { id: "use", topic: "Change of use / certificate of occupancy", ask: "Does the new concept change the permitted use or occupancy class? Ask the local building department." },
  { id: "hood", topic: "Ventilation / hood", ask: "Does the new cooking equipment need a different hood or make-up air? Ask a licensed MEP engineer." },
  { id: "grease", topic: "Grease interceptor and plumbing", ask: "Is the grease trap and drain sized for the new menu and fixtures?" },
  { id: "gas", topic: "Gas and electrical capacity", ask: "Can the existing service carry the new equipment load?" },
  { id: "fire", topic: "Fire suppression", ask: "Does the hood suppression system match the new appliances?" },
  { id: "occ", topic: "Occupant load and egress", ask: "Does the seat count change the occupant load or exits required?" },
  { id: "ada", topic: "Accessibility", ask: "Do the changed areas trigger accessibility upgrades?" },
  { id: "structure", topic: "Structural (walls, roof loads)", ask: "Is any wall to be opened load-bearing; do heavy units need floor or roof review?" },
  { id: "landlord", topic: "Landlord consent and lease terms", ask: "Does the lease allow the alterations and the new use?" },
  { id: "permits", topic: "Permits and health inspection", ask: "Which permits and plan reviews apply to the work?" },
];
