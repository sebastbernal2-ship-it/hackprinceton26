import { fetchNextQuestion } from "./api";
import { DEMO_FALLBACK } from "./demo-flag";

export type Exchange = { question: string; answer: string };

export const MAX_QUESTIONS = 3;
export const FIRST_QUESTION = "What are you looking for?";

/** Used only with NEXT_PUBLIC_DEMO_FALLBACK=1. */
const DEMO_FOLLOW_UPS: { question: string; covered: (said: string) => boolean }[] = [
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
 * Asks the API for the next intake question (deterministic rules, labelled stub by the API).
 * Returns null when there is nothing left to ask, or when the API cannot be reached:
 * the intake then ends and Discover reports the connection problem. No invented questions.
 */
export async function nextQuestion(history: Exchange[]): Promise<string | null> {
  if (history.length >= MAX_QUESTIONS) return null;
  try {
    return (await fetchNextQuestion(history)).question;
  } catch {
    if (!DEMO_FALLBACK) return null;
    const said = history.map((exchange) => exchange.answer).join(" ");
    const asked = new Set(history.map((exchange) => exchange.question));
    return DEMO_FOLLOW_UPS.find((followUp) => !asked.has(followUp.question) && !followUp.covered(said))?.question ?? null;
  }
}
