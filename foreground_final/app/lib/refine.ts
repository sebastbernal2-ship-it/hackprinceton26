import type { Exchange } from "./next-question";

export const MAX_REFINE = 2;
export const FIRST_REFINE = "What would you like to change?";

/**
 * The refine agent (/api/intake in refine mode): asks what should change, given the original brief.
 * Returns null when the brief is ready to re-rank.
 */
export async function nextRefineQuestion(history: Exchange[], prior: Exchange[] = []): Promise<string | null> {
  if (history.length >= MAX_REFINE) return null;
  try {
    const res = await fetch("/api/intake", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ history, prior, mode: "refine", maxQuestions: MAX_REFINE }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { question: string | null };
    return body.question ?? null;
  } catch {
    return null;
  }
}
