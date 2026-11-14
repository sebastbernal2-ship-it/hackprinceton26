import { NextResponse } from "next/server";
import { askClaude, parseJson } from "../../lib/anthropic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    history?: { question: string; answer: string }[];
  } | null;
  const history = Array.isArray(body?.history) ? body.history.slice(0, 6) : [];
  if (history.length === 0) return NextResponse.json({ question: "What are you looking for?" });
  const transcript = history.map((turn, index) => `${index + 1}. Q: ${turn.question}\nA: ${turn.answer}`).join("\n");
  try {
    const text = await askClaude(
      `You interview a restaurant owner who is looking for a commercial space. Ask one short follow-up that helps search listings: budget or monthly rent, city or neighborhood, seats, concept, patio or drive-thru, or a must-have. Use what they already said. Do not repeat a question. If the answers already include a budget and either a place or a size, return question null. Return JSON only: {"question":"..."} or {"question":null}.`,
      transcript,
    );
    const parsed = parseJson(text);
    const question = parsed && "question" in parsed ? parsed.question : null;
    return NextResponse.json({ question: typeof question === "string" && question.trim() ? question.trim() : null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The intake agent is unavailable.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
