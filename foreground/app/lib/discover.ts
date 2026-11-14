import { useEffect, useState } from "react";
import { readBrief } from "./brief";
import type { Exchange } from "./next-question";
import { monthlyRent, MATCH_POOL, rankMatches, type Fact, type Match } from "./matches";

const KEY = "foreground.matches";
const CHANGE = "foreground-matches";

function read(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function notify() {
  window.dispatchEvent(new Event(CHANGE));
}

export function saveMatches(matches: Match[]) {
  sessionStorage.setItem(KEY, JSON.stringify(matches));
  notify();
}

export function seedMatches(brief: Exchange[]) {
  saveMatches(rankMatches(brief));
}

export function clearMatches() {
  sessionStorage.removeItem(KEY);
  notify();
}

/** Re-rank from the current brief plus any refine answers, then persist. */
export function refreshMatches(brief: Exchange[]) {
  saveMatches(rankMatches(brief));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function loadMatches(): Match[] {
  const stored = read();
  if (!stored) return rankMatches([]);
  try {
    const parsed = JSON.parse(stored) as Match[];
    if (!Array.isArray(parsed)) return rankMatches([]);
    return parsed.map((match) => {
      if (match.facts) return match;
      const source = MATCH_POOL.find((space) => space.address === match.address && space.detail === match.detail);
      return source ? { ...match, facts: source.facts } : match;
    });
  } catch {
    return rankMatches([]);
  }
}

/** Current Discover results for this tab. Falls back to an unbriefed ranking until intake seeds one. */
export function useMatches(): Match[] {
  // Session storage is read after mount so the first paint matches the server.
  const [matches, setMatches] = useState<Match[]>(() => rankMatches([]));

  useEffect(() => {
    const apply = () => setMatches(loadMatches());
    apply();
    void enrichFromAgent();
    return subscribe(() => {
      apply();
    });
  }, []);

  return matches;
}

let enriching = false;

async function enrichFromAgent() {
  const brief = readBrief();
  const current = loadMatches();
  if (!brief.length || current.some((match) => match.reason) || enriching) return;
  enriching = true;
  try {
    const response = await fetch("/api/property-agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "rank",
        brief,
        listings: current.map((match, index) => ({
          id: index,
          address: match.address,
          detail: match.detail,
          city: match.city,
          blurb: match.blurb,
          squareFeet: match.squareFeet,
          monthlyRent: monthlyRent(match),
          rentPerSquareFootYear: match.rentPerSquareFootYear,
          facts: [...(match.facts?.property ?? []), ...(match.facts?.location ?? [])].map((row) => `${row.label}: ${row.value}`),
        })),
      }),
    });
    if (!response.ok) return;
    const body = (await response.json()) as {
      listings?: { id?: number; confidence?: number; reason?: string; notes?: Fact[] }[];
    };
    const notes = body.listings ?? [];
    saveMatches(
      current.map((match, index) => {
        const note = notes.find((row) => Number(row.id) === index);
        if (!note) return match;
        const confidence = Number(note.confidence);
        return {
          ...match,
          confidence: Number.isFinite(confidence) ? Math.max(60, Math.min(96, Math.round(confidence))) : match.confidence,
          reason: typeof note.reason === "string" ? note.reason : match.reason,
          notes: Array.isArray(note.notes) ? note.notes.filter((row) => row && row.label && row.value).slice(0, 3) : match.notes,
        };
      }),
    );
  } catch {
    // The local ranking stays on screen if the property agent is down.
  } finally {
    enriching = false;
  }
}
