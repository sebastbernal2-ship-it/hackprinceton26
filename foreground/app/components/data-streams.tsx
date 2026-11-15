"use client";

import { useEffect, useState } from "react";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Stream = { title: string; status: "observed" | "derived" | "unknown"; lines: string[] };

const get = (url: string): Promise<Json | null> =>
  fetch(url).then((r) => (r.ok ? r.json() : null), () => null);

const BADGE = { observed: "bg-match-soft text-match", derived: "border border-dashed border-foreground/40", unknown: "border border-foreground/20 text-foreground/50" };

/** One compact card per data stream we hold for this site: building record, structure/hazard screen, restaurant history, scan checks. */
export default function DataStreams({ listingId }: { listingId: number }) {
  const [streams, setStreams] = useState<Stream[] | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([get(`/api/structure/${listingId}`), get(`/api/lineage/${listingId}`), get(`/api/triage/property/${listingId}`), get(`/api/aerial/${listingId}`)]).then(
      ([st, li, tr, ae]) => {
        if (!live) return;
        const out: Stream[] = [];
        const kit = st?.kit;
        out.push(kit
          ? { title: "Building record (CoStar)", status: "observed", lines: [
              [kit.yearBuilt && `Built ${kit.yearBuilt}${kit.renovatedYear ? `, renovated ${kit.renovatedYear}` : ""}`, kit.stories && `${kit.stories} stories`].filter(Boolean).join(" · "),
              [kit.material, kit.buildingClass && `Class ${kit.buildingClass}`, kit.hasSprinklers === false ? "no sprinklers" : kit.hasSprinklers ? "sprinklered" : ""].filter(Boolean).join(" · "),
            ].filter(Boolean) }
          : { title: "Building record (CoStar)", status: "unknown", lines: ["Not available for this listing."] });
        const sc = st?.screening;
        out.push(sc
          ? { title: "Structure & hazard screen", status: "derived", lines: [
              `Overall screening tier: ${sc.tier}`,
              Object.entries(sc.tierByLens ?? {}).map(([k, v]) => `${String(k).replace("_", "/")} ${v}`).join(" · "),
              "Screening prior, not an engineering assessment.",
            ].filter(Boolean) }
          : { title: "Structure & hazard screen", status: "unknown", lines: ["No structure snapshot for this listing."] });
        out.push(li?.foodHistoryInKit
          ? { title: "Restaurant history", status: "observed", lines: [
              `${li.counts?.foodTenants ?? li.tenants?.length ?? 0} past food tenancy record(s)`,
              li.medianCompletedTenureYears != null ? `Median completed tenure ${li.medianCompletedTenureYears} yr` : "",
              li.isSecondGenerationSpace ? "Second-generation food space" : "",
            ].filter(Boolean) }
          : { title: "Restaurant history", status: "unknown", lines: [li ? "No food tenancy in the CoStar kit (unknown, not proof of none)." : "Not available."] });
        const f: Json[] = tr?.fields ?? [];
        out.push(f.length > 0
          ? { title: "Scan vs CoStar checks", status: "derived", lines: [
              `${f.filter((x) => x.status === "verified" || x.status === "consistent").length} of ${f.length} fields confirmed by scan or aerial`,
              `${f.filter((x) => x.status === "unverified").length} unverified, ${f.filter((x) => String(x.status).startsWith("blank")).length} blank in CoStar`,
            ] }
          : { title: "Scan vs CoStar checks", status: "unknown", lines: ["No triage for this listing."] });
        out.push(ae
          ? { title: "Aerial analysis", status: "derived", lines: ["Vexcel aerial analysed for this site."] }
          : { title: "Aerial analysis", status: "unknown", lines: ["No aerial analysis for this listing."] });
        setStreams(out);
      },
    );
    return () => { live = false; };
  }, [listingId]);

  if (!streams) return null;
  return (
    <section className="mt-8" aria-labelledby="streams-title">
      <h2 id="streams-title" className="text-lg font-medium tracking-tight">Data we hold on this site</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {streams.map((s) => (
          <div key={s.title} className="rounded-2xl border border-foreground/12 p-4 text-sm">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-medium">{s.title}</h3>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${BADGE[s.status]}`}>{s.status === "observed" ? "Observed" : s.status === "derived" ? "Derived" : "Unknown"}</span>
            </div>
            <div className="mt-2 space-y-1 text-foreground/65">{s.lines.map((l) => <p key={l}>{l}</p>)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
