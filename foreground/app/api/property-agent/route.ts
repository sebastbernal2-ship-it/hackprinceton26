import { NextResponse } from "next/server";
import { failureStatus } from "../../lib/server-env";
import { askClaude, parseJson } from "../../lib/anthropic";

type ListingCard = {
  id?: number;
  address: string;
  detail: string;
  city: string;
  blurb: string;
  squareFeet: number;
  monthlyRent: number;
  rentPerSquareFootYear: number;
  facts: string[];
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    mode?: "rank" | "ask";
    brief?: { question: string; answer: string }[];
    listings?: ListingCard[];
    question?: string;
    listing?: ListingCard;
  } | null;
  if (body?.mode === "ask") return askAbout(body.question || "", body.listing);
  return rank(body?.brief || [], body?.listings || []);
}

async function rank(brief: { question: string; answer: string }[], listings: ListingCard[]) {
  if (!listings.length) return NextResponse.json({ listings: [] });
  const transcript = brief.map((turn) => `Q: ${turn.question}\nA: ${turn.answer}`).join("\n") || "No brief yet.";
  const cards = listings
    .map(
      (listing, index) =>
        `${index + 1}. id ${listing.id ?? index}. ${listing.address} ${listing.detail}, ${listing.city}, ${listing.squareFeet} sq ft, $${listing.monthlyRent}/mo, $${listing.rentPerSquareFootYear}/sf/year. ${listing.blurb} Facts: ${listing.facts.join("; ")}`,
    )
    .join("\n");
  try {
    const text = await askClaude(
      `You are the property agent for a restaurant owner. Score each listing from the facts given. Do not invent square footage, rent, or amenities that are not in the facts. Seat estimates must be labeled as estimates. Confidence is an integer from 60 to 96. reason is one or two sentences on why the score fits this owner. notes are exactly two short implications a restaurant operator can use, each with a label and value, derived only from the given numbers and description. Copy each listing id exactly. Return JSON only: {"listings":[{"id":0,"confidence":80,"reason":"","notes":[{"label":"","value":""}]}]}`,
      `Brief:\n${transcript}\n\nListings:\n${cards}`,
    );
    const parsed = parseJson(text);
    const rows = Array.isArray(parsed?.listings) ? parsed.listings : [];
    return NextResponse.json({ listings: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The property agent is unavailable.";
    return NextResponse.json({ error: message }, { status: failureStatus(error) });
  }
}

async function askAbout(question: string, listing?: ListingCard) {
  if (!question.trim() || !listing) return NextResponse.json({ reply: "Ask about this space." }, { status: 400 });
  try {
    const text = await askClaude(
      `You answer a restaurant owner about one commercial listing. Use only the facts provided. If a detail is not in the facts, say it is not on the listing. Two or three sentences. No JSON.`,
      `Question: ${question}\nListing: ${listing.address} ${listing.detail}, ${listing.city}. ${listing.blurb} ${listing.squareFeet} sq ft, $${listing.monthlyRent}/mo, $${listing.rentPerSquareFootYear}/sf/year. ${listing.facts.join("; ")}`,
    );
    return NextResponse.json({ reply: text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The property agent is unavailable.";
    return NextResponse.json({ error: message }, { status: failureStatus(error) });
  }
}
