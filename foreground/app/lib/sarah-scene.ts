// SCRIPTED DEMO. When the first intake answer contains the word "Sarah", the follow-up questions are skipped
// and this fixed two-answer brief goes to the real /api/matches. Nothing here is inferred from a user.
import type { Exchange } from "./next-question";

export const SARAH_NOTICE = "Demo scene: Sarah (scripted answers)";
export const SARAH_LIMIT = 5;

export const SARAH_Q1 = "What are you looking for?";
export const SARAH_A1 =
  "I'm Sarah. I run Fruity Yogurt, a small yogurt and juice shop in Houston, and I want to open an independent cafe as a second concept, with coffee, pastries and light food, in Houston or Los Angeles. I'm looking for 800 to 1,500 sq ft with 24 to 40 seats, and my build-out budget is under $250,000. I want to carry over what works at my current shop: my counter, my seating and my look.";
export const SARAH_Q2 = "Anything the space must have?";
export const SARAH_A2 =
  "A space that already had food service, so a hood and grease line might already exist. Power and water for an espresso setup, an accessible entrance, and a 3D scan so I can walk it before I visit. Nice to have is street frontage and daytime foot traffic from nearby offices. My dealbreakers are unknown utilities, a lease area nobody will confirm, and a landlord who won't state the permitted use.";

export const SARAH_BRIEF: Exchange[] = [
  { question: SARAH_Q1, answer: SARAH_A1 },
  { question: SARAH_Q2, answer: SARAH_A2 },
];

/** True when the first answer contains "Sarah" as a whole word, any case. */
export function isSarahPrompt(text: string): boolean {
  return /\bsarah\b/i.test(text);
}
