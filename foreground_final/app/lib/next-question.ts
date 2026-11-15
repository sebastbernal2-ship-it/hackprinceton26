export type Exchange = { question: string; answer: string };

export const MAX_QUESTIONS = 3;
export const FIRST_QUESTION = "What are you looking for?";

/**
 * The intake agent (/api/intake): Claude reads the answers so far into a brief and asks for the most important
 * thing the search still lacks. Returns null when there is enough to search, or when the agent cannot be reached
 * (the search agent then works with what it has).
 */
export async function nextQuestion(history: Exchange[]): Promise<string | null> {
  if (history.length >= MAX_QUESTIONS) return null;
  try {
    const res = await fetch("/api/intake", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ history, mode: "intake", maxQuestions: MAX_QUESTIONS }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { question: string | null };
    return body.question ?? null;
  } catch {
    return null;
  }
}
