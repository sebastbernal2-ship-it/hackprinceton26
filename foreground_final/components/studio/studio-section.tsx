import { Section } from "@/components/site/primitives";
import type { OwnerBrief } from "@/lib/engine/types";
import type { Site } from "@/lib/sites/schema";
import { Studio } from "./studio";

/** Rail anchor for this section. */
export const STUDIO_RAIL = { id: "plan", label: "Make it yours" };

/**
 * Layout Studio: the owner rearranges the real floor by dragging or by instruction and watches seats, build-out,
 * break-even and the three-year outlook follow. Self-contained: give it a site and a brief.
 */
export function StudioSection({ site, brief }: { site: Site; brief: OwnerBrief }) {
  const mp = site.matterport;
  const where = mp?.scanOfExactSuite ? "this suite" : "a neighbouring suite in the same building";
  const pair = mp?.beforeAfter[0];
  const media = [
    pair?.after ? { src: pair.after, caption: `src Matterport, furniture removed: ${where}, empty` } : null,
    pair?.before ? { src: pair.before, caption: `src Matterport scan of ${where}, as found` } : mp?.photos[0] ? { src: mp.photos[0], caption: `src Matterport scan of ${where}` } : null,
  ].filter((m): m is { src: string; caption: string } => m !== null);

  // the browser only needs what the engine and the planner read
  const slim: Site = {
    ...site,
    matterport: mp ? { ...mp, panos: [], photos: [], beforeAfter: [], description: undefined } : null,
    aerial: site.aerial ? { ...site.aerial, detections: [] } : null,
    otherSpaces: [],
  };

  return (
    <Section id={STUDIO_RAIL.id} title="Make it yours" aside="Drag the pieces or say what you want. The numbers follow.">
      <Studio site={slim} brief={brief} media={media} />
    </Section>
  );
}
