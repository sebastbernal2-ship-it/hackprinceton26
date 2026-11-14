"use client";

import Image from "next/image";
import { useState } from "react";
import { monthlyRent, type Match } from "../lib/matches";
import { useMatches } from "../lib/discover";
import PropertyInfo from "./property-info";
import TourOverlay from "./tour-overlay";

const number = new Intl.NumberFormat("en-US");

export default function Discover() {
  const matches = useMatches();
  const [tour, setTour] = useState<Match | null>(null);
  const [info, setInfo] = useState<Match | null>(null);

  return (
    <>
      <header className="animate-rise">
        <h1 className="text-[clamp(1.6rem,4vw,2.5rem)] font-medium leading-tight tracking-tight">Discover</h1>
        <p className="mt-2 text-foreground/50">{matches.length} spaces, best fit first.</p>
      </header>

      <ul className="mt-10 grid grid-cols-1 gap-x-10 gap-y-14 md:grid-cols-2">
        {matches.map((match, index) => (
          <li key={`${match.listingId}-${match.detail}`} className="animate-rise" style={{ animationDelay: `${100 + index * 90}ms` }}>
            <article className="group">
              <div className="relative aspect-[16/10] overflow-hidden rounded-[1.75rem] bg-foreground/5 shadow-[0_1px_0_rgb(27_26_23/0.04)] transition-[box-shadow,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-1 group-hover:shadow-[0_22px_50px_rgb(27_26_23/0.12)]">
                <Image
                  src={match.photo}
                  alt={`Exterior of ${match.address}`}
                  fill
                  unoptimized
                  sizes="(min-width: 768px) 50vw, 100vw"
                  className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]"
                />
              </div>

              <div className="mt-6 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[clamp(1.4rem,2.4vw,1.85rem)] font-medium tracking-tight tabular-nums">
                    ${number.format(monthlyRent(match))}
                    <span className="text-[0.55em] font-normal text-foreground/45">/mo</span>
                  </p>
                  <p className="mt-1 text-sm text-foreground/50">{match.city}</p>
                </div>
                <span className="shrink-0 rounded-full bg-match-soft px-3 py-1 text-sm font-medium tabular-nums text-match">
                  {match.confidence}% match
                </span>
              </div>

              <p className="mt-4 text-[0.95rem] leading-relaxed text-foreground/55">{match.blurb}</p>
              {match.reason ? <p className="mt-2 text-sm leading-relaxed text-foreground/70">{match.reason}</p> : null}
              <p className="mt-2 text-sm text-foreground/40">
                {match.address}
                {match.detail ? ` · ${match.detail}` : ""} · {number.format(match.squareFeet)} sq ft
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
          squareFeet={tour.squareFeet}
          onClose={() => setTour(null)}
        />
      )}
    </>
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
