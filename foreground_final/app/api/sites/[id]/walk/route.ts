import { z } from "zod";
import { autoLayout } from "@/lib/layout";
import { walkable } from "@/lib/immersive/walk";
import { loadSite } from "@/lib/sites/load";
import { furnitureFor } from "@/lib/three-d/furniture-place";
import { engineBrief } from "../../../../lib/server/site-match";

const Body = z.object({
  brief: z
    .object({
      concept: z.enum(["quick-service", "fast-casual", "full-service", "cafe", "bar"]).optional(),
      seats: z.number().int().min(4).max(400).optional(),
      budgetUsd: z.number().int().min(1).max(50_000_000).optional(),
    })
    .nullish(),
});

/**
 * POST { brief } -> { site, furniture, concept } for the 360 "Imagine" view: the walkable Matterport panoramas
 * (six cube faces each) and, when the scan is of this exact suite, the suggested floor plan as 3D furniture.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const site = loadSite(id);
  if (!site) return Response.json({ error: "Unknown site." }, { status: 404 });
  if (!site.matterport) return Response.json({ error: "No scan for this space." }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Bad request." }, { status: 400 });

  const panos = walkable(site.matterport.panos);
  if (!panos.length) return Response.json({ error: "This scan has no 360 views." }, { status: 404 });
  const brief = engineBrief(parsed.data.brief, site);
  const layout = autoLayout(site, brief);
  return Response.json({
    site: {
      id: site.id,
      address: site.address,
      matterport: { panos, rooms: site.matterport.rooms.map((r) => ({ label: r.label, polygon: r.polygon })) },
    },
    furniture: furnitureFor(site, layout),
    concept: brief.concept,
  });
}
