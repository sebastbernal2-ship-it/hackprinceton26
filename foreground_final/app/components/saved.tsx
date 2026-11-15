"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { monthlyRent, type Match } from "../lib/matches";
import { toggleSaved, useDesign, useSaved } from "../lib/saved";
import PropertyInfo from "./property-info";
import { Bookmark } from "./save-button";
import TourOverlay from "./tour-overlay";

const number = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Bookmarked properties, each with the 3D tour design you left it with. */
export default function Saved() {
  const saved = useSaved();
  const [tour, setTour] = useState<Match | null>(null);
  const [info, setInfo] = useState<Match | null>(null);

  return (
    <>
      <header className="animate-rise">
        <h1 className="text-[clamp(1.6rem,4vw,2.5rem)] font-medium leading-tight tracking-tight">Saved</h1>
        <p className="mt-2 text-foreground/50">
          {saved.length
            ? `${saved.length} ${saved.length === 1 ? "space" : "spaces"} you bookmarked, with the 3D designs you made.`
            : "Spaces you bookmark show up here, with their 3D tour designs."}
        </p>
      </header>

      {saved.length === 0 && (
        <div className="mt-10 max-w-md rounded-[1.75rem] bg-panel px-6 py-6 animate-rise">
          <p className="flex items-center gap-2 font-medium">
            <Bookmark /> Nothing saved yet
          </p>
          <p className="mt-2 text-sm leading-relaxed text-foreground/55">
            Press Save on any space in Discover. Whatever you design in its 3D tour, objects, walls and the running total, is kept with it.
          </p>
          <Link href="/dashboard" className="mt-5 inline-flex rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background">
            Go to Discover
          </Link>
        </div>
      )}

      <ul className="mt-10 grid grid-cols-1 gap-x-10 gap-y-14 md:grid-cols-2">
        {saved.map(({ match, savedAt }, index) => (
          <li key={match.siteId} className="animate-rise" style={{ animationDelay: `${100 + index * 90}ms` }}>
            <SavedCard match={match} savedAt={savedAt} onTour={() => setTour(match)} onInfo={() => setInfo(match)} />
          </li>
        ))}
      </ul>

      {info && !tour && <PropertyInfo match={info} onBack={() => setInfo(null)} onTour={() => setTour(info)} />}
      {tour && (
        <TourOverlay
          siteId={tour.siteId}
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

function SavedCard({ match, savedAt, onTour, onInfo }: { match: Match; savedAt: number; onTour: () => void; onInfo: () => void }) {
  const design = useDesign(match.siteId);
  const objects = design?.pieces.length ?? 0;
  const removed = design ? Object.keys(design.wallEdits.removed).length : 0;
  const added = design?.wallEdits.added.length ?? 0;
  const names = [...new Set((design?.pieces ?? []).map((piece) => piece.product?.name ?? piece.custom?.name ?? piece.label.split(" · ")[0]))];

  return (
    <article className="group">
      <div className="relative aspect-[16/10] overflow-hidden rounded-[1.75rem] bg-foreground/5">
        <Image src={match.photo} alt={`Exterior of ${match.address}`} fill unoptimized sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
        <button
          type="button"
          onClick={() => toggleSaved(match)}
          aria-label={`Remove ${match.address} from Saved`}
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-background/90 text-accent shadow-sm transition-opacity hover:opacity-80"
        >
          <Bookmark filled />
        </button>
      </div>

      <div className="mt-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[clamp(1.4rem,2.4vw,1.85rem)] font-medium tracking-tight tabular-nums">
            ${number.format(monthlyRent(match))}
            <span className="text-[0.55em] font-normal text-foreground/45">/mo</span>
          </p>
          <p className="mt-1 text-sm text-foreground/50">
            {match.city} · saved {new Date(savedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-match-soft px-3 py-1 text-sm font-medium tabular-nums text-match">{match.confidence}% match</span>
      </div>
      <p className="mt-2 text-sm text-foreground/40">
        {match.address}
        {match.detail ? ` · ${match.detail}` : ""} · {number.format(match.squareFeet)} sq ft
      </p>

      <div className="mt-4 rounded-[1.1rem] bg-panel px-4 py-3 text-sm">
        {design ? (
          <>
            <p className="font-medium">Your 3D design · {money.format(design.total)}</p>
            <p className="mt-1 text-foreground/55">
              {[
                objects ? `${objects} ${objects === 1 ? "object" : "objects"}` : null,
                removed ? `${removed} ${removed === 1 ? "wall" : "walls"} removed` : null,
                added ? `${added} ${added === 1 ? "wall" : "walls"} added` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {names.length > 0 && <p className="mt-1 truncate text-foreground/45">{names.slice(0, 3).join(", ")}{names.length > 3 ? "…" : ""}</p>}
          </>
        ) : (
          <p className="text-foreground/55">No 3D design yet. Open the tour to add objects or change walls; it saves as you go.</p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onTour}
          className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          {design ? "Open my 3D design" : "Open 3D Tour"}
        </button>
        <button
          type="button"
          onClick={onInfo}
          className="inline-flex items-center rounded-full border border-foreground/15 px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-70"
        >
          View Info
        </button>
      </div>
    </article>
  );
}
