import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Site } from "./schema";

const PUBLIC_SITES = join(process.cwd(), "public", "sites");

/** Best small picture for a site: a scan photo, then a scan still, then the aerial, then the CoStar photo. */
export function siteThumb(site: Site): string | null {
  const dir = join(PUBLIC_SITES, site.id);
  if (existsSync(dir)) {
    const files = readdirSync(dir).sort();
    const pick =
      files.find((f) => /^photo-1\.(jpe?g|png|webp)$/i.test(f)) ??
      files.find((f) => /^before-.*\.(jpe?g|png|webp)$/i.test(f)) ??
      files.find((f) => /^photo-.*\.(jpe?g|png|webp)$/i.test(f)) ??
      files.find((f) => /^aerial\.(jpe?g|png|webp)$/i.test(f));
    if (pick) return `/sites/${site.id}/${pick}`;
  }
  return site.photoUrl ?? null;
}

/** The light site facts the search UI needs before the agent reports engine numbers. */
export type SiteCard = {
  id: string;
  address: string;
  suite: string | null;
  city: string;
  sf: number;
  rentPerSfYr: number | null;
  thumb: string | null;
  /** cached Vexcel ortho, when prepared */
  aerial: string | null;
  lat: number;
  lng: number;
};

export function siteCard(site: Site): SiteCard {
  const aerial = site.aerial?.orthoPath && existsSync(join(process.cwd(), "public", site.aerial.orthoPath)) ? site.aerial.orthoPath : null;
  return {
    id: site.id,
    address: site.address,
    suite: site.space.suite,
    city: site.city,
    sf: site.space.sf,
    rentPerSfYr: site.space.rentPerSfYr,
    thumb: siteThumb(site),
    aerial,
    lat: site.lat,
    lng: site.lng,
  };
}
