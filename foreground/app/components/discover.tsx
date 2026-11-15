"use client";

import ListingPhoto from "./listing-photo";
import { useState } from "react";
import { buildoutCaption, buildoutLabel, heroPhoto, rentEstimateLabel, monthlyRent, rentLabel, type Match } from "../lib/matches";
import { useMatches, type MatchesState } from "../lib/discover";
import EvidenceReadiness from "./evidence-readiness";
import Stepper from "./stepper";
import PropertyInfo from "./property-info";
import TourOverlay from "./tour-overlay";
import DemoSites from "./demo-sites";

const number = new Intl.NumberFormat("en-US");

export default function Discover() {
  const state = useMatches();
  const matches = state.status === "ready" ? state.matches : [];
  const [tour, setTour] = useState<Match | null>(null);
  const [info, setInfo] = useState<Match | null>(null);

  return (
    <>
      <header className="animate-rise">
        <div className="mb-4"><Stepper active={1} /></div>
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
                <EvidenceReadiness match={match} />
              </div>

              <p className="mt-4 text-[0.95rem] leading-relaxed text-foreground/55">{match.blurb}</p>
              <p className="mt-2 text-sm text-foreground/40">
                {match.address}
                {match.detail ? ` · ${match.detail}` : ""} · {match.spaceSquareFeet ? `${number.format(match.spaceSquareFeet)} sq ft ${match.spaceSource === "scan" ? "measured from scan" : "available"}` : "space size not listed"}
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
        <TourOverlay
          tourId={tour.tourId}
          title={tour.address}
          detail={tour.detail}
          onClose={() => setTour(null)}
        />
      )}
    </>
  );
}

function subtitle(state: MatchesState) {
  if (state.status !== "ready" || state.matches.length === 0) return "Spaces from the candidate registry.";
  return `${state.matches.length} candidate spaces, shown in the order the service returned them.`;
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
