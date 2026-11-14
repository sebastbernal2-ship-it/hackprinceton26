import type { Exchange } from "./next-question";

export const MAX_REFINE = 2;
export const FIRST_REFINE = "What would you like to change?";

const FOLLOW_UPS: { question: string; covered: (said: string) => boolean }[] = [
  {
    question: "Should we prioritize budget, size, or neighborhood?",
    covered: (said) => /\bbudget\b|\bsize\b|\bneighborhood\b|\bcheap\b|\blarger?\b|\bsmaller?\b|\bpatio\b/i.test(said),
  },
  {
    question: "Anything else to weight in the search?",
    covered: () => false,
  },
];

/**
 * Stand-in for the refine agent. Replace with the agent service later; keep the signature.
 * Returns null when the brief is ready to re-rank.
 */
export async function nextRefineQuestion(history: Exchange[]): Promise<string | null> {
  if (history.length >= MAX_REFINE) return null;
  const said = history.map((exchange) => exchange.answer).join(" ");
  const asked = new Set(history.map((exchange) => exchange.question));
  const next = FOLLOW_UPS.find((followUp) => !asked.has(followUp.question) && !followUp.covered(said));
  await new Promise((resolve) => setTimeout(resolve, 600));
  return next?.question ?? null;
}
