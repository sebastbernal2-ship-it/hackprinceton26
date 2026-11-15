import type { Site } from "@/lib/sites/schema";
import { benchmarks } from "./benchmarks";
import type { Occupancy } from "./types";

const NET_TYPES = /^(n|nn|nnn|triple net|net)$/i;

/**
 * Annual occupancy cost = rent x SF, plus estimated taxes + insurance + CAM when the lease is net (NNN).
 * Gross leases (FSG, MG, IG, ...) already include those, so nothing is added.
 * A missing service type is treated as NNN (the cautious read); a missing rent falls back to a city estimate.
 * low/mid/high come from the range of the NNN extras estimate.
 */
export function occupancy(site: Site): Occupancy {
  const { sf, rentPerSfYr, serviceType } = site.space;
  const notes: string[] = [];

  let rent = rentPerSfYr;
  if (rent === null) {
    const fallback = benchmarks.fallbackRentPerSfYr[site.city];
    rent = fallback.value;
    notes.push(`No rent quoted; using $${Math.round(rent)}/SF/yr for ${site.city} (${fallback.source.label})`);
  } else {
    // sentences round per-SF figures to $1; annualUsd below uses the exact rent
    notes.push(`$${Math.round(rent)}/SF/yr asking rent (CoStar listing)`);
  }

  const net = serviceType === null || NET_TYPES.test(serviceType.trim());
  const extras = benchmarks.nnnExtrasPerSfYr[site.city];
  const add = net ? { low: extras.low, mid: extras.mid, high: extras.high } : { low: 0, mid: 0, high: 0 };

  if (net) {
    const lease = serviceType === null ? "Service type not quoted, assumed NNN" : `${serviceType} lease`;
    notes.push(
      `${lease}: plus $${extras.mid}/SF/yr taxes, insurance and CAM ($${extras.low}-${extras.high}, ${extras.source.label})`,
    );
  } else {
    notes.push(`${serviceType} lease: taxes, insurance and CAM are included in the rent`);
  }
  notes.push(`x ${sf.toLocaleString("en-US")} SF`);

  return {
    annualUsd: { low: sf * (rent + add.low), mid: sf * (rent + add.mid), high: sf * (rent + add.high) },
    extrasPerSfYr: add.mid,
    basis: notes.join("; "),
  };
}
