"use client";

import ListingPhoto from "./listing-photo";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { buildoutCaption, buildoutLabel, heroPhoto, rentEstimateLabel, monthlyRent, rentLabel, type ConceptGate, type Match } from "../lib/matches";
import { useMatches, type MatchesState } from "../lib/discover";
import { alignmentView, topAlignment } from "../lib/alignment";
import CompatibilityPill from "./compatibility-pill";
import Stepper from "./stepper";
import PropertyInfo from "./property-info";
import TourEntry from "./tour-entry";
import DemoSites from "./demo-sites";

const number = new Intl.NumberFormat("en-US");

export default function Discover() {
  const state = useMatches();
  const matches = state.status === "ready" ? state.matches : [];
  const [tour, setTour] = useState<Match | null>(null);
  const [info, setInfo] = useState<Match | null>(null);
  const leaders = topAlignment(matches);
  const router = useRouter();
  // Steps 3 onward belong to one property, so they open the top candidate.
  const goStep = (step: number) => { if (step === 0) router.push("/"); else if (step >= 2 && matches[0]) setInfo(matches[0]); };

  return (
    <>
      <header className="animate-rise">
        <div className="mb-4 hidden sm:block"><Stepper active={1} onStep={goStep} /></div>
        <h1 className="text-[clamp(1.6rem,4vw,2.5rem)] font-medium leading-tight tracking-tight">Shortlist</h1>
        <p className="mt-2 text-foreground/50">{subtitle(state)}</p>
      </header>

      {state.status === "loading" && <p className="mt-10 text-foreground/50">Loading spaces…</p>}
      {state.status === "error" && (
        <Notice title="Could not reach the data service">
          {state.message} Start the API (or <code>npm run mock-api</code>) and reload.
        </Notice>
      )}
      {state.status === "ready" && !state.dataAvailable && !state.demo && (
        <Notice title="No data loaded">
          The API has no candidate registry loaded, so there is nothing to show. Build it with the data scripts
          (local, ignored files) and restart the API. No placeholder spaces are shown.
        </Notice>
      )}
      {state.status === "ready" && state.dataAvailable && matches.length === 0 && (
        <Notice title="No spaces matched">The registry is loaded, but no candidate matched this brief.</Notice>
      )}

      {state.status === "ready" && state.conceptGate && state.conceptGate.excluded > 0 && <GateNote gate={state.conceptGate} />}

      <ul className="mt-10 grid grid-cols-1 gap-x-10 gap-y-14 md:grid-cols-2">
        {matches.map((match, index) => (
          <li key={`${match.listingId}-${match.detail}`} className="animate-rise" style={{ animationDelay: `${100 + index * 90}ms` }}>
            <article className="group">
              <div className="relative aspect-[16/10] overflow-hidden rounded-[1.75rem] bg-foreground/5 shadow-[0_1px_0_rgb(27_26_23/0.04)] transition-[box-shadow,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-1 group-hover:shadow-[0_22px_50px_rgb(27_26_23/0.12)]">
                <ListingPhoto
                  src={heroPhoto(match)}
                  alt={`Exterior of ${match.address}`}
                  className="absolute inset-0 h-full w-full transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]"
                />
              </div>

              <div className="mt-6 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-foreground/45">{buildoutCaption(match.buildout)}</p>
                  <p
                    className="mt-1 text-[clamp(1.4rem,2.4vw,1.85rem)] font-medium tracking-tight tabular-nums"
                    title={match.buildout?.reason ?? "No build-out estimate for this site"}
                  >
                    {buildoutLabel(match.buildout)}
                  </p>
                  <p className="mt-1 text-sm text-foreground/50">
                    {match.city}
                    {rentEstimateLabel(match.rent) ? (
                      <span title={match.rent?.reason}> · {rentEstimateLabel(match.rent)}</span>
                    ) : monthlyRent(match) !== null ? (
                      ` · ${rentLabel(match)}`
                    ) : (
                      " · rent unknown"
                    )}
                  </p>
                </div>
                <CompatibilityPill match={match} />
              </div>

              <AlignmentLine match={match} leader={leaders.includes(index)} />
              <PickReasons match={match} />

              <p className="mt-4 text-[0.95rem] leading-relaxed text-foreground/55">{match.blurb}</p>
              <p className="mt-2 text-sm text-foreground/40">
                {match.address}
                {match.detail ? ` · ${match.detail}` : ""} · {match.spaceSquareFeet ? `${number.format(match.spaceSquareFeet)} sq ft ${match.spaceSource === "scan" ? "measured from scan" : match.spaceSource === "scan-estimate" ? "estimated demo area" : "available"}` : "space size not listed"}
                {match.squareFeet > 0 ? ` · ${number.format(match.squareFeet)} sq ft building` : ""}
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setTour(match)}
                  className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-[transform,opacity] duration-300 hover:opacity-90 active:scale-[0.98]"
                >
                  <Cube />
                  Open 3D Tour
                </button>
                <button
                  type="button"
                  onClick={() => setInfo(match)}
                  className="inline-flex items-center rounded-full border border-foreground/15 px-5 py-2.5 text-sm font-medium transition-[transform,opacity] duration-300 hover:opacity-70 active:scale-[0.98]"
                >
                  View Info
                </button>
              </div>
            </article>
          </li>
        ))}
      </ul>

      <DemoSites onOpen={setInfo} />

      {info && !tour && (
        <PropertyInfo
          match={info}
          onBack={() => setInfo(null)}
          onTour={() => setTour(info)}
        />
      )}

      {tour && (
        <TourEntry
          tourId={tour.tourId}
          title={tour.address}
          detail={tour.detail}
          onClose={() => setTour(null)}
        />
      )}
    </>
  );
}

/** Transparency for the concept gate: how many sites were left out as unable to host the concept, and why. */
function GateNote({ gate }: { gate: ConceptGate }) {
  const word = gate.concept === "cafe" ? "cafe" : "restaurant";
  return (
    <details className="mt-6 max-w-2xl rounded-xl border border-foreground/15 px-4 py-3 text-sm" data-testid="concept-gate">
      <summary className="cursor-pointer font-medium">
        {gate.excluded} of {gate.total} sites excluded as not {word}-capable
      </summary>
      <p className="mt-2 text-xs text-foreground/55">
        Only spaces whose recorded use and suite size can host a {word} are shown. Use comes from the CoStar property type and subtype, size from the listed available suite (else the scanned
        space), never the whole building. Planning rules, not a permit check.
      </p>
      <ul className="mt-2 space-y-2">
        {gate.groups.map((g) => (
          <li key={g.type}>
            <details>
              <summary className="cursor-pointer text-foreground/75">
                {g.type} <span className="text-foreground/45">({g.count})</span>
              </summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-foreground/55">
                {g.sites.map((s) => (
                  <li key={s.listingId}>
                    {s.address}, {s.city.split(",")[0]}: {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
    </details>
  );
}

function PickReasons({ match }: { match: Match }) {
  const pick = match.pick;
  if (!pick || (pick.reasons.length === 0 && !pick.bestMatch)) return null;
  return (
    <div className="mt-3" data-testid="pick-reasons">
      {pick.bestMatch && (
        <p className="inline-block rounded-full bg-accent/15 px-3 py-1 text-xs font-medium uppercase tracking-wide text-accent" data-testid="best-match">
          {pick.label ?? "Best match (demo pick)"}
        </p>
      )}
      <ul className="mt-2 space-y-1 text-sm text-foreground/60">
        {pick.reasons.map((r) => (
          <li key={r}>· {r}</li>
        ))}
      </ul>
    </div>
  );
}

function subtitle(state: MatchesState) {
  if (state.status !== "ready" || state.matches.length === 0) return "Spaces from the candidate registry.";
  return `${state.matches.length} candidate spaces, shown in the order the service returned them.`;
}

function AlignmentLine({ match, leader }: { match: Match; leader: boolean }) {
  const view = alignmentView(match);
  if (!view) return null;
  return (
    <details data-testid="alignment" className={`mt-4 rounded-xl border px-4 py-3 text-sm ${leader ? "border-match bg-match-soft" : "border-foreground/15"}`}>
      <summary className="cursor-pointer font-medium">
        {view.line}
        {leader && <span className="ml-2 rounded-full bg-match px-2 py-0.5 text-xs font-medium text-background">Most confirmed</span>}
      </summary>
      <p className="mt-2 text-xs text-foreground/55">Counts your stated requirements the data supports; estimates are marked. Seat capacity is estimated from floor area. It is not a prediction or a fit score.</p>
      {view.confirmed.length > 0 && (
        <>
          <p className="mt-2 text-xs font-medium">Met</p>
          <ul className="list-disc pl-5 text-foreground/70">{view.confirmed.map((c) => <li key={c}>{c}{view.estimatedItems?.includes(c) ? " (estimate)" : ""}</li>)}</ul>
        </>
      )}
      {view.unknownItems.length > 0 && (
        <>
          <p className="mt-2 text-xs font-medium">Unknown (no evidence found)</p>
          <ul className="list-disc pl-5 text-foreground/70">{view.unknownItems.map((c) => <li key={c}>{c}</li>)}</ul>
        </>
      )}
    </details>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div role="status" className="mt-10 max-w-xl rounded-2xl border border-foreground/15 p-6">
      <p className="font-medium">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-foreground/60">{children}</p>
    </div>
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
