import type { OwnerBrief } from "@/lib/engine/types";
import { usd, usdRange } from "@/lib/format";
import type { Site } from "@/lib/sites/schema";
import type { Ask } from "./ask-list";

/** The asks the email leads with. */
export function topAsks(asks: Ask[], n = 4): Ask[] {
  return asks.slice(0, n);
}

function subject(site: Site): string {
  return `${site.address}${site.space.suite ? `, Suite ${site.space.suite}` : ""}`;
}

const value = (a: Ask) => (a.value === null ? "" : ` (${usdRange(a.value)}${a.basis === "per-year" ? " a year" : ""})`);

/** One line per ask with its reasoning, used as the model's grounding list. */
export function askLine(a: Ask): string {
  return `${a.title}${value(a)}. ${a.why}`;
}

/** Deterministic email, used whenever the model call fails. Same facts, no model. */
export function fallbackEmail(site: Site, asks: Ask[], brief: OwnerBrief): string {
  const top = topAsks(asks);
  const budget = brief.budgetUsd !== undefined ? ` with a ${usd(brief.budgetUsd)} build-out budget` : "";
  const plan = brief.seats ? `, planning a ${brief.concept.replace("-", " ")} with about ${Math.round(brief.seats)} seats` : "";
  const lines = top.map((a, i) => `${i + 1}. ${a.title}${value(a)}`);
  return [
    "Hello,",
    "",
    `I'm an independent restaurant owner looking at ${subject(site)}${plan}${budget}. I'm interested, and before I go further I'd like to talk about a few terms that would make the numbers work:`,
    "",
    ...lines,
    "",
    "I can share the figures behind each of these. Could we set up a call this week, and could I get my contractor into the space for a walk-through?",
    "",
    "Thank you,",
    "[Your name]",
    "[Your phone]",
  ].join("\n");
}

/** Prompt for the model. It sees only the asks and facts below. */
export function emailPrompt(site: Site, asks: Ask[], brief: OwnerBrief): { system: string; user: string } {
  const top = topAsks(asks);
  const facts = [
    `Property: ${subject(site)}, ${site.city}, ${site.state}`,
    `Space: ${Math.round(site.space.sf)} SF`,
    site.space.rentPerSfYr != null
      ? `Asking rent: $${site.space.rentPerSfYr}/SF/yr${site.space.serviceType ? ` ${site.space.serviceType}` : ""}`
      : "Asking rent: not quoted",
    `Concept: ${brief.concept.replace("-", " ")}`,
    brief.seats ? `Planned seats: ${Math.round(brief.seats)}` : null,
    brief.budgetUsd !== undefined ? `Build-out budget: ${usd(brief.budgetUsd)}` : null,
  ].filter(Boolean);
  return {
    system:
      "You write short emails for an independent restaurant owner to a commercial listing broker. Plain, direct, polite, first person, no hype, no legal language. " +
      "Use only the facts and asks given. Do not invent numbers, names, dates or promises. Say 'left' for tenants who left; never say a tenant failed. " +
      "Keep it under 180 words. Start with 'Hello,'. Present the asks as a short numbered list, each with its dollar figure if given. " +
      "Ask for a call and a contractor walk-through. End with '[Your name]'. Output only the email body, no subject line, no commentary.",
    user: `Facts:\n${facts.join("\n")}\n\nAsks, most important first:\n${top.map((a, i) => `${i + 1}. ${askLine(a)}`).join("\n")}`,
  };
}
