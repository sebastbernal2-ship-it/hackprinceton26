export type Exchange = { question: string; answer: string };

export const MAX_QUESTIONS = 3;
export const FIRST_QUESTION = "What are you looking for?";

const FOLLOW_UPS: { question: string; covered: (said: string) => boolean }[] = [
  {
    question: "Which city, Houston or Los Angeles?",
    covered: (said) => /\bhouston\b|\blos angeles\b/i.test(said) || /\bL\.?A\.?\b/.test(said),
  },
  {
    question: "What is your budget for the build-out?",
    covered: (said) => /\$\s?\d|\b\d+(\.\d+)?\s?(k|grand|thousand|million)\b|\bbudget\b/i.test(said),
  },
  {
    question: "How many seats are you planning for?",
    covered: (said) => /\b\d+[\s-]*(seats?|seater|covers|guests|people)\b/i.test(said),
  },
  {
    question: "Anything the space must have?",
    covered: () => false,
  },
];

/**
 * Stand-in for the planner agent: asks about whatever the answers so far have not covered.
 * Replace the body with a request to the agent service and keep the signature.
 * Returns null when there is nothing left to ask.
 */
export async function nextQuestion(history: Exchange[]): Promise<string | null> {
  if (history.length >= MAX_QUESTIONS) return null;
  const said = history.map((exchange) => exchange.answer).join(" ");
  const asked = new Set(history.map((exchange) => exchange.question));
  const next = FOLLOW_UPS.find((followUp) => !asked.has(followUp.question) && !followUp.covered(said));
  // Simulated agent latency, so the thinking state is visible until the real agent is wired in.
  await new Promise((resolve) => setTimeout(resolve, 600));
  return next?.question ?? null;
}
