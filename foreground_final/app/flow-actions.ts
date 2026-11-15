"use server";

import { buildOfferCta, buildOutlook, type OfferCtaPayload, type OutlookPayload } from "@/components/flow/outlook-data";
import { analyzeSite, type Concept } from "@/lib/engine";
import { buildTour, type TourStop } from "@/lib/immersive/tour";
import { autoLayout, type Layout } from "@/lib/layout";
import type { Site } from "@/lib/sites/schema";
import { walkable } from "@/lib/immersive/walk";
import { loadSite } from "@/lib/sites/load";
import { loadReplays } from "@/lib/agent/replay";

const CONCEPTS: Concept[] = ["quick-service", "fast-casual", "full-service", "cafe", "bar"];

/** Server-side because loadSite reads data/sites. Returns null for an unknown site or a bad brief. */
export async function getOutlook(
  siteId: string,
  brief: { concept: Concept; seats?: number; budgetUsd?: number },
): Promise<{ outlook: OutlookPayload; offer: OfferCtaPayload } | null> {
  if (typeof siteId !== "string" || !CONCEPTS.includes(brief?.concept)) return null;
  const site = loadSite(siteId);
  if (!site) return null;
  const b = { concept: brief.concept, seats: brief.seats, budgetUsd: brief.budgetUsd, city: site.city };
  return { outlook: buildOutlook(site, b), offer: buildOfferCta(site, b) };
}

export type WalkData = {
  site: {
    id: string;
    address: string;
    matterport: {
      panos: {
        id: string;
        position: { x: number; y: number; z: number };
        rotation?: { x: number; y: number; z: number; w: number };
        label?: string;
        skybox?: string[];
        skyboxEmpty?: string[];
      }[];
      rooms: { label: string; polygon?: [number, number][] }[];
    };
  };
  stops: TourStop[];
  rentLabel: string;
};

function walkFor(site: Site, brief: { concept: Concept; seats?: number; budgetUsd?: number }): WalkData | null {
  if (!site.matterport) return null;
  const panos = walkable(site.matterport.panos);
  if (!panos.length) return null;
  const rooms = site.matterport.rooms.map((r) => ({ label: r.label, polygon: r.polygon }));
  const a = analyzeSite(site, { concept: brief.concept, seats: brief.seats, budgetUsd: brief.budgetUsd, city: site.city });
  const stops = buildTour({
    panos,
    rooms,
    findings: site.findings,
    lines: a.xray.lines.map((l) => ({ kind: l.kind, status: l.status, label: l.label, range: l.range, findingId: l.findingId })),
  });
  const rent = site.space.rentPerSfYr;
  return {
    site: { id: site.id, address: site.address, matterport: { panos, rooms } },
    stops,
    rentLabel: rent ? `$${Math.round(rent)}/SF/yr asking` : "Rent on request",
  };
}

/** What the in-flow viewer needs: the walkable panos and a guided tour built from findings and engine cost lines. */
export async function getWalk(
  siteId: string,
  brief: { concept: Concept; seats?: number; budgetUsd?: number },
): Promise<WalkData | null> {
  if (typeof siteId !== "string" || !CONCEPTS.includes(brief?.concept)) return null;
  const site = loadSite(siteId);
  return site ? walkFor(site, brief) : null;
}

export type DealData = {
  /** the full site file (about 35 KB): the chapters compute from it in the browser, nothing refetches numbers */
  site: Site;
  /** the suggested plan for this brief: the owner's plan starts here */
  layout: Layout;
  /** the guided tour, null when the space has no walkable scan */
  walk: WalkData | null;
};

/**
 * The shared state of a chosen space, fetched once when the owner picks it: the site, the suggested layout and
 * the walk. Impact and permit checks are pure and run in the browser over the layout (components/flow/deal-context).
 */
export async function getDeal(
  siteId: string,
  brief: { concept: Concept; seats?: number; budgetUsd?: number },
): Promise<DealData | null> {
  if (typeof siteId !== "string" || !CONCEPTS.includes(brief?.concept)) return null;
  const site = loadSite(siteId);
  if (!site) return null;
  const b = { concept: brief.concept, seats: brief.seats, budgetUsd: brief.budgetUsd, city: site.city };
  return { site, layout: autoLayout(site, b), walk: walkFor(site, brief) };
}

/** The briefs of the recorded runs (`/?replay=1`): the examples shown then are exactly these, so the run matches what was typed. */
export async function getReplayQueries(): Promise<string[]> {
  return loadReplays().map((r) => r.query);
}
