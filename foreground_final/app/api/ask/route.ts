import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { analyzeSite } from "@/lib/engine";
import { loadSite } from "@/lib/sites/load";
import { guard } from "@/lib/rate-limit";
import { rentFor } from "@/lib/ml/rent";

const MODEL = "claude-opus-5-5";
const TIMEOUT_MS = 60_000;
/** web search is on the Anthropic side: the model searches only when the space data does not cover the question */
const MAX_SEARCHES = 3;

export const maxDuration = 90;

const Body = z.object({
  siteId: z.string().regex(/^[A-Za-z0-9_-]+$/).max(40),
  question: z.string().trim().min(2).max(500),
  brief: z.object({
    concept: z.enum(["quick-service", "fast-casual", "full-service", "cafe", "bar"]),
    seats: z.number().int().min(4).max(400).optional(),
    budgetUsd: z.number().int().min(10_000).max(20_000_000).optional(),
  }),
});

const SYSTEM = `You answer a restaurant owner's question about ONE commercial space.
Start from the JSON data you are given (CoStar listing, Matterport scan findings, Vexcel aerial, Foreground's cost engine); quote its dollar figures exactly.
When the question needs something that data does not cover (foot traffic, nearby restaurants and competitors, the neighborhood, news, local rules, demographics), use web search on the space's address and area. Say plainly which facts come from the web, and never invent a number.
Answer in at most five short sentences of plain words, no markdown, no headings. Do not give legal or financial advice beyond what the data and sources state.`;

/**
 * POST { siteId, brief, question } -> { answer, source }. Grounded: the model sees the engine's analysis of this
 * site for this brief and nothing else. When it cannot be reached the route says so (502); it never fabricates.
 */
export async function POST(req: Request) {
  const blocked = guard(req, "ask", 10_000);
  if (blocked) return blocked;
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return Response.json({ error: "That question could not be read." }, { status: 400 });
  const site = loadSite(parsed.data.siteId);
  if (!site) return Response.json({ error: "Unknown site." }, { status: 404 });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: "The assistant is not configured (no model key on the server)." }, { status: 503 });

  const brief = { ...parsed.data.brief, city: site.city };
  const a = analyzeSite(site, brief);
  const rent = rentFor(site.id);
  const base = a.scenarios.scenarios.base;
  const data = {
    space: { address: site.address, city: site.city, sf: site.space.sf, askingRentPerSfYr: site.space.rentPerSfYr ?? null },
    brief,
    allIn: a.xray.total,
    costLines: a.xray.lines.map((l) => ({ label: l.label, status: l.status, range: l.range })),
    breakeven: { coversPerDay: a.breakeven.coversPerDay, turnsPerDay: a.breakeven.turnsPerDay, verdict: a.breakeven.verdict },
    baseCase: { annualProfitUsd: base.annualProfitUsd, paybackYears: base.paybackYears },
    fairRent: rent ? { band: rent.band, lowPerSfYr: rent.intervalLowPerSfYr, highPerSfYr: rent.intervalHighPerSfYr, gapPerYr: rent.gapPerYr } : null,
    pastTenants: a.graveyard.summary,
    blockTrend: a.trend.rating,
    timeToOpen: a.timeToOpen,
    findings: site.findings.map((f) => ({ kind: f.kind, status: f.status, evidence: f.evidence })),
  };

  const client = new Anthropic({ apiKey: key });
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: `Space data:\n${JSON.stringify(data)}\n\nAddress: ${site.address}, ${site.city}, ${site.state} ${site.postcode}\n\nQuestion: ${parsed.data.question}` },
  ];
  try {
    let response: Anthropic.Beta.BetaMessage | null = null;
    // a long search turn can pause; send the partial turn back so the model finishes it
    for (let turn = 0; turn < 3; turn += 1) {
      response = await client.beta.messages.create(
        {
          model: MODEL,
          max_tokens: 4000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "low" },
          system: SYSTEM,
          tools: [
            {
              type: "web_search_20260209",
              name: "web_search",
              max_uses: MAX_SEARCHES,
              user_location: { type: "approximate", city: site.city, region: site.state, country: "US" },
            },
          ],
          messages,
        },
        { timeout: TIMEOUT_MS },
      );
      if (response.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: response.content });
    }
    if (!response) return Response.json({ error: "The model returned no answer." }, { status: 502 });
    if (response.stop_reason === "refusal") return Response.json({ error: "The model declined this question." }, { status: 502 });

    const sources = new Map<string, string>();
    let answer = "";
    const found = new Map<string, string>();
    for (const block of response.content) {
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) if (r.type === "web_search_result") found.set(r.url, r.title);
      }
      if (block.type !== "text") continue;
      answer += block.text;
      for (const c of block.citations ?? []) {
        if (c.type === "web_search_result_location" && c.url) sources.set(c.url, c.title ?? new URL(c.url).hostname);
      }
    }
    // cited pages first; when the answer carries no inline citations, the pages the search read
    if (!sources.size) for (const [url, title] of [...found].slice(0, 3)) sources.set(url, title);
    answer = answer.replace(/\s+\n/g, "\n").trim();
    if (!answer) return Response.json({ error: "The model returned no answer." }, { status: 502 });
    const searched = response.content.some((b) => b.type === "server_tool_use");
    return Response.json({
      answer,
      sources: [...sources].slice(0, 5).map(([url, title]) => ({ url, title })),
      source: searched ? "Claude, from this space's analysis and the web" : "Claude, from this space's analysis",
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return Response.json({ error: "The assistant is busy; try again in a moment." }, { status: 429 });
    if (err instanceof Anthropic.APIConnectionTimeoutError) return Response.json({ error: "The model took too long." }, { status: 502 });
    if (err instanceof Anthropic.APIError) return Response.json({ error: `The model answered with HTTP ${err.status ?? "error"}.` }, { status: 502 });
    return Response.json({ error: "The model could not be reached." }, { status: 502 });
  }
}
