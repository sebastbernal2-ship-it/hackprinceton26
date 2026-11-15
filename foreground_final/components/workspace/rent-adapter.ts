import { formatGap, formatRent, formatRentRange, rentFor, rentModelSkill } from "@/lib/ml/rent";

/** The fair-rent estimate as the sheet prints it: strings and a handful of numbers, prepared on the server. */
export type RentView = {
  askingText: string;
  fairText: string;
  rangeText: string;
  band: "above market" | "in line" | "below market";
  gapText: string;
  gapPerYr: number;
  /** the ask was quoted gross, so the band is not trusted */
  basisUncertain: boolean;
  comps: { label: string; detail: string }[];
  disclosure: string;
};

export function rentViewFor(siteId: string): RentView | null {
  const r = rentFor(siteId);
  if (!r) return null;
  const skill = rentModelSkill();
  return {
    askingText: `${formatRent(r.askingNnnEquivPerSfYr)}/SF/yr`,
    fairText: `${formatRent(r.fairRentPerSfYr)}/SF/yr`,
    rangeText: formatRentRange(r.intervalLowPerSfYr, r.intervalHighPerSfYr),
    band: r.band,
    gapText: formatGap(r.gapPerSfYr),
    gapPerYr: r.gapPerYr,
    basisUncertain: r.basisUncertain,
    comps: r.comps.slice(0, 3).map((c) => ({
      label: `${c.address}${c.suite ? ` #${c.suite}` : ""}`,
      detail: `${Math.round(c.sf).toLocaleString("en-US")} SF · $${Math.round(c.rentNnnEquivPerSfYr)}/SF/yr · ${c.distanceKm.toFixed(1)} km`,
    })),
    disclosure: `Estimate of asking rent, 80% range; typically off by about $${skill.mae.toFixed(0)}/SF/yr on buildings it has not seen`,
  };
}
