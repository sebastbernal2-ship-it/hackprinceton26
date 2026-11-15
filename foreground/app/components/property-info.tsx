"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ListingPhoto from "./listing-photo";
import InspectionPanel from "./inspection-panel";
import CostarBuilding from "./costar-building";
import PlanVision from "./plan-vision";
import LayoutPanel from "./layout-panel";
import Quantify from "./quantify";
import type { LayoutSummary } from "../lib/layout-summary";
import type { Asset } from "../lib/assets";
import Stepper from "./stepper";
import { heroPhoto, rentLabel, type FactorCard, type Match } from "../lib/matches";
import FactorCards from "./factor-cards";
import Projections from "./projections";
import SpaceChat from "./space-chat";
import TriagePanel from "./triage/triage-panel";
import CompatibilityPill from "./compatibility-pill";
import DataStreams from "./data-streams";
import StructurePanel from "./structure/structure-panel";

const number = new Intl.NumberFormat("en-US");

type PropertyInfoProps = {
  match: Match;
  onBack: () => void;
  onTour: () => void;
};

export default function PropertyInfo({ match, onBack, onTour }: PropertyInfoProps) {
  const facts = match.facts ?? {
    photos: [match.photo],
    property: [
      { label: "Space Available", value: `${number.format(match.squareFeet)} sq ft` },
      { label: "Property Type", value: "Retail" },
      { label: "Availability", value: "Immediately" },
    ],
    location: [{ label: "Matterport", value: `Model ${match.tourId}` }],
  };
  const listed = (facts.photos.length > 0 ? facts.photos : [heroPhoto(match)]).filter((url) => typeof url === "string" && url.length > 0);
  const photos = listed.length > 0 ? listed : [""];
  const [index, setIndex] = useState(0);
  const [askOpen, setAskOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  // Demo scans are not candidates, so their evidence cards come from data/build_demo_factor_cards.py via the API.
  const [demoFactors, setDemoFactors] = useState<FactorCard[] | null>(null);
  useEffect(() => {
    if (!match.demo || !match.tourId) return;
    let live = true;
    fetch(`/api/demo/${encodeURIComponent(match.tourId)}/factors`)
      .then((r) => (r.ok ? r.json() : []))
      .then((cards: FactorCard[]) => { if (live) setDemoFactors(cards); }, () => {});
    return () => { live = false; };
  }, [match.demo, match.tourId]);
  const [quantify, setQuantify] = useState<{ layout: LayoutSummary | null } | null>(null);
  // Café demo path: the placed reference kit and the owner's assumed area are shared by the layout panel and Quantify.
  const [kit, setKit] = useState<Asset[]>([]);
  const [area, setArea] = useState("");
  const router = useRouter();
  const lastLayout = useRef<LayoutSummary | null>(null);
  const scrollTo = (id: string) => window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }) ?? document.querySelector(`[data-testid="${id}"]`)?.scrollIntoView({ behavior: "smooth" }), 500);
  // The seven workflow steps map to views of this property: 0 intake page, 1 shortlist, 2 overview, 3 layout, 4 quantify,
  // 5 act checklist (inside quantify), 6 re-plan (deeper analysis).
  const [current, setCurrent] = useState(2);
  function goStep(step: number) {
    if (step < 0 || step > 6) return;
    setCurrent(step);
    if (step === 0) { router.push("/"); return; }
    if (step === 1) { onBack(); return; }
    setPlanOpen(step === 3);
    setQuantify(step === 4 || step === 5 ? { layout: lastLayout.current } : null);
    if (step === 2) setTab("overview");
    if (step === 6 && !match.demo) { setTab("analysis"); scrollTo("replan-panel"); }
    if (step === 6 && match.demo) setTab("overview");
    if (step === 5) scrollTo("act-title");
  }
  const [tab, setTab] = useState<"overview" | "layout" | "analysis">("overview");
  const hero = photos[index % photos.length];
  const thumbs = photos.filter((_, photoIndex) => photoIndex !== index % photos.length).slice(0, 3);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (planOpen || quantify) return;
      if (askOpen) {
        setAskOpen(false);
        return;
      }
      onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack, askOpen, planOpen, quantify]);

  function step(delta: number) {
    setIndex((current) => (current + delta + photos.length) % photos.length);
  }

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-background text-foreground">
      <button
        type="button"
        onClick={onBack}
        className="ml-4 mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-foreground/70 transition-opacity hover:opacity-70"
      >
        <ChevronLeft />
        Back to Shortlist
      </button>
      <div className="mx-auto max-w-[84rem] px-6 pb-16 pt-8 sm:px-12">
        <div className="mb-5"><Stepper active={current} onStep={goStep} /></div>
        <div className={`grid items-stretch gap-4 ${thumbs.length > 0 ? "lg:grid-cols-[1.65fr_0.72fr]" : ""}`}>
          <div className={`relative self-start overflow-hidden rounded-[1.35rem] bg-foreground/5 ${thumbs.length > 0 ? "aspect-[16/10]" : "aspect-[16/7]"}`}>
            <ListingPhoto src={hero} alt={`${match.address} ${match.detail}`} className="absolute inset-0 h-full w-full" />
            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => step(-1)}
                  aria-label="Previous photo"
                  className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm"
                >
                  <ChevronLeft />
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  aria-label="Next photo"
                  className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm"
                >
                  <ChevronRight />
                </button>
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                  {photos.map((photo, photoIndex) => (
                    <span
                      key={photo}
                      className={`h-1.5 w-1.5 rounded-full ${photoIndex === index % photos.length ? "bg-background" : "bg-background/45"}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 lg:h-full lg:grid-cols-1 lg:grid-rows-3">
            {thumbs.map((photo, thumbIndex) => {
              const photoIndex = photos.indexOf(photo);
              return (
                <button
                  key={photo}
                  type="button"
                  onClick={() => setIndex(photoIndex)}
                  className="relative aspect-[16/9] min-h-0 overflow-hidden rounded-[1.1rem] bg-foreground/5 lg:aspect-auto"
                >
                  <ListingPhoto src={photo} alt="" className="absolute inset-0 h-full w-full" />
                  <span className="sr-only">Show photo {thumbIndex + 1}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-xl">
            <h1 className="text-[clamp(1.7rem,3vw,2.15rem)] font-medium tracking-tight">
              {match.address}
              {match.detail ? ` · ${match.detail}` : ""}
            </h1>
            <p className="mt-1 text-sm text-foreground/50">{match.city}</p>
            <p className="mt-3 max-w-lg text-[0.95rem] leading-relaxed text-foreground/60">{match.blurb}</p>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-[clamp(1.6rem,2.6vw,2rem)] font-medium tracking-tight tabular-nums">
              {rentLabel(match)}
            </p>
            <CompatibilityPill match={match} />
          </div>
        </div>

        <nav aria-label="Property sections" className="mt-8 flex gap-1 border-b border-foreground/10">
          {([["overview", "Overview"], ["layout", "Layout & equipment"], ...(match.demo ? [] : [["analysis", "Deeper analysis"]])] as [typeof tab, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-current={tab === key ? "page" : undefined}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm transition-colors ${tab === key ? "border-foreground font-medium" : "border-transparent text-foreground/55 hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === "overview" && (
        <div className="mt-6 grid gap-10 md:grid-cols-2">
          <FactList title="Property details" rows={facts.property} />
          <FactList title="Location & area" rows={facts.location.filter((row) => !/^(latitude|longitude|postal code)$/i.test(row.label))} />
        </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onTour}
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            <Cube />
            Open 3D Tour
          </button>
          <button
            type="button"
            onClick={() => setAskOpen((current) => !current)}
            aria-expanded={askOpen}
            className="inline-flex items-center gap-2 rounded-full border border-foreground/20 bg-background px-5 py-3 text-sm font-medium transition-opacity hover:opacity-70"
          >
            <Spark />
            Ask Fio
          </button>
          <p className="text-xs text-foreground/45">
            {match.tourId ? `Matterport model ${match.tourId} (property-level link; may not show this exact suite).` : "No Matterport model on file."}
          </p>
        </div>

        {tab === "overview" && (
          <>
            {match.costarPropertyId && <CostarBuilding propertyId={match.costarPropertyId} city={match.city} />}
            {!match.demo && <DataStreams listingId={match.listingId} />}
            <FactorCards factors={demoFactors ?? match.factors ?? []} demo={match.demo && !demoFactors?.length} />
          </>
        )}

        {tab === "layout" && <LayoutPanel match={match} items={kit} onItems={setKit} area={area} onArea={setArea} />}

        {tab === "analysis" && !match.demo && (
          <>
            <TriagePanel listingId={match.listingId} />
            <InspectionPanel listingId={match.listingId} />
            <StructurePanel listingId={match.listingId} />
            <Projections listingId={match.listingId} />
          </>
        )}

        <p className="mt-5 text-xs text-foreground/40">
          Sources: CoStar listing and market data, the Matterport model on file, and Vexcel aerial where available.
        </p>

        <section className="mt-12 rounded-[1.75rem] bg-foreground/[0.04] px-6 py-10 text-center sm:px-10" aria-labelledby="vision-title" data-testid="vision-cta">
          <h2 id="vision-title" className="text-[clamp(1.4rem,2.6vw,1.9rem)] font-medium tracking-tight">Like what you&apos;re seeing?</h2>
          <p className="mx-auto mt-2 max-w-md text-[0.95rem] leading-relaxed text-foreground/55">
            Step inside the 3D model of this space, move things around and try out your layout.
          </p>
          <button
            type="button"
            onClick={() => setPlanOpen(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition-[transform,opacity] duration-300 hover:opacity-90 active:scale-[0.98]"
          >
            <Cube />
            Scope out your vision
          </button>
        </section>
      </div>
      <SpaceChat match={match} open={askOpen} onOpenChange={setAskOpen} />
      {planOpen && (
        <PlanVision
          tourId={match.tourId} title={match.address} detail={match.detail} onClose={() => setPlanOpen(false)}
          step={current} onStep={goStep} onContinue={(layout) => { lastLayout.current = layout; setCurrent(4); setPlanOpen(false); setQuantify({ layout }); }}
        />
      )}
      {quantify && (
        <Quantify
          match={match} layout={quantify.layout} kit={kit} onKit={setKit} area={area} onArea={setArea}
          step={current} onStep={goStep} onBackToLayout={() => { setCurrent(3); setQuantify(null); setPlanOpen(true); }}
          onClose={() => setQuantify(null)}
        />
      )}
    </div>
  );
}

function FactList({ title, rows }: { title: string; rows: { label: string; value: string }[] }) {
  return (
    <section>
      <h2 className="text-base font-medium tracking-tight">{title}</h2>
      <dl className="mt-4 divide-y divide-foreground/10">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[1fr_1.3fr] items-baseline gap-4 py-2.5 text-sm">
            <dt className="text-foreground/55">{row.label}</dt>
            <dd className="font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M14.5 6.5 9 12l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M9.5 6.5 15 12l-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Cube() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M12 3.5 19 7.5v9L12 20.5 5 16.5v-9L12 3.5Z" strokeLinejoin="round" />
      <path d="M12 12.2 19 7.7M12 12.2 5 7.7M12 12.2v8.3" strokeLinejoin="round" />
    </svg>
  );
}

function Spark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M12 4.5 13.2 9 17.5 10.2 13.2 11.4 12 16 10.8 11.4 6.5 10.2 10.8 9 12 4.5Z" strokeLinejoin="round" />
      <path d="m17.2 14.2.5 1.6 1.6.5-1.6.5-.5 1.6-.5-1.6-1.6-.5 1.6-.5.5-1.6Z" strokeLinejoin="round" />
    </svg>
  );
}
