"use client";

import { useEffect, useState } from "react";

type Extended = {
  propertyType: string | null;
  buildingClass: number | null;
  buildingRating: number | null;
  areaSqft: number | null;
  tenancies?: { tenant: string | null; contractRatePerSfYear: number | null }[];
  listings?: { status: string | null; created: string | null; brokerage: string | null }[];
  apartment?: { minRent: number | null; maxRent: number | null; unitsAvailable: number | null; totalUnits: number | null } | null;
  notice?: string;
};
type Market = { metro: string; contractRatePerSfYear?: { n: number; median: number | null } };

const number = new Intl.NumberFormat("en-US");
const CLASS: Record<number, string> = { 1: "A", 2: "B", 3: "C", 4: "F" };
const TYPE_LABEL: Record<string, string> = { GeneralRetail: "Retail", MixedUse: "Mixed use", Multifamily: "Apartments" };

/** The building's CoStar kit record (/api/costar/{id}/extended) plus the metro's kit lease-rate median. Observed records
 * for the BUILDING, not for the scanned space; missing fields are left out, never shown as zero. */
export default function CostarBuilding({ propertyId, city }: { propertyId: number; city: string }) {
  const [ex, setEx] = useState<Extended | null | undefined>(undefined);
  const [market, setMarket] = useState<Market | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/costar/${propertyId}/extended`).then((r) => (r.ok ? r.json() : null)).then((d) => live && setEx(d), () => live && setEx(null));
    const metro = city.split(",")[0].trim();
    if (metro) fetch(`/api/costar/market?metro=${encodeURIComponent(metro)}`).then((r) => (r.ok ? r.json() : null)).then((d) => live && setMarket(d), () => {});
    return () => { live = false; };
  }, [propertyId, city]);

  if (ex === undefined) return <p className="mt-8 text-sm text-foreground/50">Loading the CoStar building record.</p>;
  if (ex === null) return <p className="mt-8 text-sm text-foreground/55">CoStar building record: not available (the API or the local CoStar kit is not running).</p>;

  const rows: { label: string; value: string }[] = [];
  if (ex.propertyType) rows.push({ label: "Building type", value: TYPE_LABEL[ex.propertyType] ?? ex.propertyType });
  if (ex.buildingClass && CLASS[ex.buildingClass]) rows.push({ label: "Building class", value: CLASS[ex.buildingClass] });
  if (ex.buildingRating) rows.push({ label: "CoStar rating", value: `${ex.buildingRating} of 5 stars` });
  if (ex.areaSqft) rows.push({ label: "Building size", value: `${number.format(Math.round(ex.areaSqft))} sq ft` });
  const leases = ex.tenancies ?? [];
  if (leases.length) rows.push({ label: "Tenancies on record", value: String(leases.length) });
  const rates = leases.map((t) => t.contractRatePerSfYear).filter((x): x is number => !!x);
  rows.push({ label: "Lease rates in this building", value: rates.length ? `${rates.length} on record` : "None on record" });
  const active = (ex.listings ?? []).filter((l) => l.status === "Active");
  if (ex.listings?.length) rows.push({ label: "Listings", value: `${active.length} active${active[0]?.brokerage ? ` · ${active[0].brokerage}` : ""}` });
  const apt = ex.apartment;
  if (apt?.totalUnits) rows.push({ label: "Apartment units", value: `${number.format(apt.totalUnits)}${apt.unitsAvailable != null ? ` · ${apt.unitsAvailable} available` : ""}` });
  if (apt?.maxRent) rows.push({ label: "Apartment rents", value: apt.minRent ? `$${number.format(apt.minRent)} – $${number.format(apt.maxRent)} /mo` : `up to $${number.format(apt.maxRent)} /mo` });
  const med = market?.contractRatePerSfYear?.median;
  if (med) rows.push({ label: `${city.split(",")[0]} lease rate (kit median)`, value: `$${med}/sq ft/yr` });

  return (
    <section className="mt-10 border-t border-foreground/10 pt-6" aria-labelledby="costar-building-title" data-testid="costar-building">
      <h2 id="costar-building-title" className="text-lg font-medium tracking-tight">CoStar building record</h2>
      <p className="mt-1 text-sm text-foreground/50">
        Property {propertyId}. Facts about the whole building, not the scanned space. The lease-rate median is over CoStar&apos;s kit sample, not market rent.
      </p>
      <dl className="mt-5 grid gap-x-14 gap-y-4 md:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[1.1fr_1.4fr] items-baseline gap-4">
            <dt className="text-foreground/55">{r.label}</dt>
            <dd className="font-medium">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
