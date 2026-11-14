"use client";

import { useEffect, useState } from "react";
import { fetchScenarios, fetchStructure, type ScenarioResponse, type StructureResponse } from "../../lib/structure";
import ExpansionSim from "./expansion-sim";
import ScenarioSlider from "./scenario-slider";
import ScreeningCard from "./screening-card";

type Loaded = { id: number; s: StructureResponse | null; c: ScenarioResponse | null };

export default function StructurePanel({ listingId }: { listingId: number }) {
  const [state, setState] = useState<Loaded | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([fetchStructure(listingId).catch(() => null), fetchScenarios(listingId).catch(() => null)]).then(([s, c]) => live && setState({ id: listingId, s, c }));
    return () => { live = false; };
  }, [listingId]);
  const cur = state?.id === listingId ? state : null;
  return (
    <section className="mt-8 border-t border-foreground/10 pt-6" aria-labelledby="structure-title">
      <h2 id="structure-title" className="text-lg font-medium tracking-tight">Structure and climate</h2>
      <p className="mt-1 text-sm text-foreground/50">A screening lens on where to look first. It is not an engineering assessment, and the scenarios are not forecasts.</p>
      {!cur && <p className="mt-3 text-sm text-foreground/50">Loading.</p>}
      {cur && !cur.s && !cur.c && <p className="mt-3 text-sm text-foreground/50" role="status">No structure data for this listing (the structure snapshot is unavailable). Screening is unknown, not low.</p>}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {cur?.s && <ScreeningCard data={cur.s} />}
        {cur?.c && <ScenarioSlider data={cur.c} />}
        <div className="lg:col-span-2"><ExpansionSim listingId={listingId} /></div>
      </div>
    </section>
  );
}
