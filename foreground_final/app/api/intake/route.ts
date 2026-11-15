import { z } from "zod";
import { parseBrief } from "@/lib/agent/brief";
import type { OwnerBrief } from "@/lib/engine";

const MODEL = "claude-haiku-5-5";

const Exchange = z.object({ question: z.string().max(300), answer: z.string().max(600) });
const Body = z.object({
  history: z.array(Exchange).max(12),
  mode: z.enum(["intake", "refine"]).default("intake"),
  /** refine: the brief collected at intake, so follow-ups know what is already settled */
  prior: z.array(Exchange).max(12).optional(),
  maxQuestions: z.number().int().min(1).max(6).default(3),
});

type Gap = { field: string; fallback: string; /** recognises an earlier question about the same thing, however it was worded */ seen: RegExp };

/** What the search agent still needs, most important first. */
function gaps(brief: OwnerBrief, said: string): Gap[] {
  const out: Gap[] = [];
  const conceptSaid = /taco|taqu|pizza|burger|cafe|coffee|bar\b|pub|bakery|restaurant|kitchen|diner|grill|sushi|ramen|bistro|italian|mexican|thai|indian|chinese|vegan|deli|bbq|fast|quick|full.?service|counter/i.test(said);
  if (!conceptSaid) out.push({ field: "concept", fallback: "What kind of place is it: a café, a counter-service spot, a full-service restaurant or a bar?", seen: /kind of|type of|concept|what are you looking/i });
  if (!brief.city) out.push({ field: "city", fallback: "Which city, Houston or Los Angeles?", seen: /city|houston|los angeles/i });
  if (!brief.budgetUsd) out.push({ field: "total build-out budget (all the money to open, not monthly rent)", fallback: "What is your budget for the build-out?", seen: /budget|spend|afford/i });
  if (!brief.seats) out.push({ field: "seats", fallback: "How many seats are you planning for?", seen: /seat|guests|covers/i });
  if (!brief.mustHaves?.length) out.push({ field: "must-haves", fallback: "Anything the space must have, like a hood, a patio or parking?", seen: /must|need|have to/i });
  return out;
}

const REFINE: Gap[] = [
  { field: "priority", fallback: "Should we prioritize budget, size, or neighborhood?", seen: /priorit|matters most|weigh/i },
  { field: "anything", fallback: "Anything else to weight in the search?", seen: /anything else|else/i },
];

/** One short follow-up from Claude, grounded in what the owner said and the gap to fill. Null when unreachable. */
async function phrase(history: z.infer<typeof Exchange>[], gap: Gap, mode: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 80,
        thinking: { type: "disabled" },
        system:
          "You are the intake agent for Foreground, which finds commercial spaces in Houston and Los Angeles for independent restaurant owners. " +
          "Write ONE short, friendly question (max 14 words, no preamble, no quotes, ends with ?) that asks for the missing detail named by the user turn. " +
          "Refer to what the owner already said when natural. Never ask about something already answered.",
        messages: [
          {
            role: "user",
            content: `Mode: ${mode}\nConversation so far:\n${history.map((h) => `Q: ${h.question}\nA: ${h.answer}`).join("\n")}\n\nMissing detail: ${gap.field}\nExample wording: ${gap.fallback}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = body.content?.find((c) => c.type === "text")?.text?.trim().replace(/^["']|["']$/g, "");
    return text && text.endsWith("?") && text.length < 160 ? text : null;
  } catch {
    return null;
  }
}

/**
 * POST { history, mode, prior?, maxQuestions } -> { question: string | null, brief, source }.
 * The intake agent: reads the brief so far (Claude Haiku structured extraction, regex fallback) and asks for the
 * most important thing the search still lacks. null = enough to search.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request." }, { status: 400 });
  const { history, mode, prior = [], maxQuestions } = parsed.data;
  const all = [...prior, ...history];
  const said = all.map((h) => h.answer).join(". ");
  const { brief, source } = said.trim().length >= 3 ? await parseBrief(said) : { brief: { concept: "full-service" } as OwnerBrief, source: "regex" as const };

  if (history.length >= maxQuestions) return Response.json({ question: null, brief, source });

  const asked = (mode === "refine" ? history : all).map((h) => h.question);
  const todo = (mode === "refine" ? REFINE : gaps(brief, said)).filter((g) => !asked.some((q) => g.seen.test(q)));
  // Intake: once concept, city and budget are known, the agent has enough to search.
  const enough = mode === "intake" && !todo.some((g) => ["concept", "city"].includes(g.field) || g.field.includes("budget")) && history.length >= 2;
  const gap = enough ? undefined : todo[0];
  if (!gap) return Response.json({ question: null, brief, source });

  const question = (await phrase(all, gap, mode)) ?? gap.fallback;
  return Response.json({ question, brief, source });
}
