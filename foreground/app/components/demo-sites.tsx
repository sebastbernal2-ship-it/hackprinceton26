"use client";

import { useEffect, useState } from "react";
import { fetchDemoSites, fetchProperty, type DemoSite } from "../lib/triage";
import type { Match } from "../lib/matches";

/** Properties with the most triage evidence, for a demo that should not land on a page of "unverified". Evidence-completeness sort, NOT a fit ranking. */
export default function DemoSites({ onOpen }: { onOpen: (m: Match) => void }) {
  const [sites, setSites] = useState<DemoSite[] | null | undefined>(undefined);
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    fetchDemoSites(6).then((r) => { if (!live) return; setSites(r ? r.sites : null); setNotice(r?.notice ?? ""); });
    return () => { live = false; };
  }, []);

  async function open(id: number) {
    setFailed(null);
    const m = await fetchProperty(id);
    if (m) onOpen(m); else setFailed(id);
  }

  if (sites === undefined || sites === null || sites.length === 0) return null;
  return (
    <section className="mt-8 rounded-2xl border border-foreground/15 p-5" aria-labelledby="demo-sites-title" data-testid="demo-sites">
      <h2 id="demo-sites-title" className="text-base font-medium tracking-tight">Demo sites</h2>
      <p className="mt-1 text-xs text-foreground/55">{notice}</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {sites.map((s) => (
          <li key={s.listingId}>
            <button type="button" onClick={() => void open(s.listingId)} className="w-full rounded-xl border border-foreground/15 px-3 py-2 text-left text-sm hover:bg-foreground/5">
              <span className="block font-medium">{s.address || `Listing ${s.listingId}`}</span>
              <span className="block text-xs text-foreground/55">{s.city} · {s.fieldsWithEvidence} of {s.fieldsTotal} triage fields have scan or aerial evidence · {s.hasScan ? "scan" : "no scan"}, {s.hasAerial ? "aerial" : "no aerial"}</span>
            </button>
          </li>
        ))}
      </ul>
      {failed !== null && <p role="alert" className="mt-2 text-xs text-accent">Could not load listing {failed}.</p>}
    </section>
  );
}
