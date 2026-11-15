import { z } from "zod";
import { loadSite, loadSites } from "@/lib/sites/load";
import { siteToMatch } from "../../lib/server/site-match";

const Brief = z
  .object({
    concept: z.enum(["quick-service", "fast-casual", "full-service", "cafe", "bar"]).optional(),
    cuisine: z.string().max(80).optional(),
    seats: z.number().int().min(1).max(400).optional(),
    budgetUsd: z.number().int().min(1).max(50_000_000).optional(),
    city: z.enum(["Houston", "Los Angeles"]).optional(),
  })
  .nullish();

const Body = z.object({
  brief: Brief,
  /** the agent's ranking, best first; omitted = every site, best engine score first */
  ranking: z
    .array(
      z.object({
        siteId: z.string().regex(/^[A-Za-z0-9_-]+$/).max(40),
        oneLineReason: z.string().max(400).optional(),
        topRisk: z.string().max(400).optional(),
        score: z.number().optional(),
      }),
    )
    .max(20)
    .optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

/** POST { brief?, ranking?, limit? } -> { matches: Match[] }: CoStar sites from data/sites shaped as the UI's cards. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request." }, { status: 400 });
  const { brief, ranking, limit = 3 } = parsed.data;

  if (ranking?.length) {
    const matches = ranking
      .map((r) => {
        const site = loadSite(r.siteId);
        return site ? siteToMatch(site, brief, { reason: r.oneLineReason, topRisk: r.topRisk, confidence: r.score }) : null;
      })
      .filter((m) => m !== null);
    return Response.json({ matches });
  }

  // No agent ranking: the engine's own score, filtered to the owner's city when they gave one.
  const sites = loadSites().filter((s) => !brief?.city || s.city === brief.city);
  const matches = sites
    .map((s) => siteToMatch(s, brief))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
  return Response.json({ matches });
}

/** GET -> { sites: { id, address, city }[] }: names for the agent's progress lines. */
export async function GET() {
  return Response.json({ sites: loadSites().map((s) => ({ id: s.id, address: s.address, city: s.city })) });
}
