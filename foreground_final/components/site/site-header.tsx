import Image from "next/image";
import Link from "next/link";
import { ViewTransition, type CSSProperties, type ReactNode } from "react";
import type { SiteAnalysis } from "@/lib/engine/types";
import type { Site } from "@/lib/sites/schema";
import { fixText, floorLabel, serviceLabel } from "@/lib/format";
import { Estimate, Src } from "./primitives";
import { Tween } from "./tween";

const d = (ms: number) => ({ ["--d" as string]: `${ms}ms` }) as CSSProperties;

const SPACE_TYPE: Record<string, string> = {
  Relet: "Second generation",
  New: "First generation shell",
  Sublet: "Sublease",
};

export function SiteHeader({ site, analysis }: { site: Site; analysis: SiteAnalysis }) {
  const s = site.space;
  const annualRent = s.rentPerSfYr != null ? s.rentPerSfYr * s.sf : null;
  const place = [site.city, site.state, site.postcode].filter(Boolean).join(", ").replace(/, (\d{5})$/, " $1");
  const suiteLine = [s.suite ? `Suite ${s.suite}` : null, floorLabel(s.floor), site.buildingName].filter(Boolean).join(" · ");
  const notes = s.notes ? fixText(s.notes).replace(/\s+/g, " ").trim() : null;

  return (
    <header className="bg-ink text-on-ink">
      <div className="mx-auto max-w-[90rem] px-4 sm:px-8">
        <div className="relative flex items-center justify-between gap-4 py-3 text-sm">
          <span aria-hidden className="hero-pull absolute inset-x-0 bottom-0 h-px bg-on-ink/20" style={d(80)} />
          <Link href="/" className="lettering-wide text-[0.8125rem] font-bold hover:underline">
            Foreground
          </Link>
          <Link href="/" className="text-on-ink-2 transition-colors duration-200 hover:text-on-ink hover:underline">
            All sites
          </Link>
        </div>

        <div className="grid gap-x-10 gap-y-6 py-6 lg:grid-cols-12 lg:py-7">
          <div className="flex flex-col gap-2 lg:col-span-8">
            <h1 className="lettering text-[2.75rem] font-bold leading-[0.95] sm:text-[3.5rem] lg:text-[4rem]">
              <span className="hero-line">
                <span style={d(120)}>{site.address}</span>
              </span>
            </h1>
            <p className="hero-fade text-lg font-medium" style={d(320)}>
              {[suiteLine, place].filter(Boolean).join(" · ")}
              <span className="block text-sm font-normal text-on-ink-2">
                {site.propertyType.replace(/([a-z])([A-Z])/g, "$1 $2")}
                {site.yearBuilt ? ` · built ${site.yearBuilt}` : ""}
                {site.yearRenovated ? `, renovated ${site.yearRenovated}` : ""}
              </span>
            </p>
            {/* a headline is a story sentence; short curation labels ("Hero site") are not shown */}
            {site.headline && site.headline.length > 24 ? (
              <p className="hero-fade max-w-2xl text-xl leading-snug text-on-ink" style={d(400)}>
                {site.headline}
              </p>
            ) : null}

            <dl className="relative mt-2 grid grid-cols-2 sm:grid-cols-4">
              <span aria-hidden className="hero-pull absolute inset-x-0 top-0 h-px bg-on-ink/25" style={d(380)} />
              <Cell i={0} label="Space" value={<Tween value={s.sf} kind="sf" delay={0.45} />} src="CoStar listing" />
              <Cell
                i={1}
                label="Asking rent"
                value={s.rentPerSfYr != null ? <>$<Tween value={s.rentPerSfYr} kind="dec2" delay={0.5} /></> : "Not quoted"}
                unit={s.rentPerSfYr != null ? "/SF/yr" : undefined}
                note={serviceLabel(s.serviceType) ?? undefined}
                src="CoStar listing"
              />
              <Cell i={2} label="Base rent / yr" value={annualRent != null ? <Tween value={annualRent} kind="usd" delay={0.55} /> : "—"} note="asking rent × SF" src="CoStar listing" />
              <Cell
                i={3}
                label="Site score"
                value={<Tween value={Math.round(analysis.score.score)} delay={0.6} />}
                unit="/100"
                note={analysis.score.flags[0] ?? analysis.score.reasons[0]}
                estimate
              />
            </dl>
          </div>

          <div className="flex flex-col gap-3 lg:col-span-4">
            {site.aerial ? (
              <figure className="hero-fade m-0" style={d(160)}>
                {/* landing target for the results page: its winning card's aerial morphs into this frame */}
                <ViewTransition name={`site-hero-${site.id}`} share="site-hero" default="none">
                  <div className="hero-wipe relative aspect-[16/10] overflow-hidden rounded-sm border border-on-ink/25 bg-on-ink/10" style={d(220)}>
                    <Image src={site.aerial.orthoPath} alt={`Aerial view of ${site.address} from straight above`} fill priority sizes="(min-width: 1024px) 30vw, 100vw" className="object-cover" />
                    {/* the survey scan that reads the parcel in */}
                    <span aria-hidden className="hero-sweep absolute inset-y-0 left-0 w-full border-l border-on-ink" style={d(220)} />
                    <span aria-hidden className="absolute top-1/2 left-1/2 size-5 -translate-x-1/2 -translate-y-1/2">
                      <span className="absolute inset-x-0 top-1/2 h-px bg-on-ink/90" />
                      <span className="absolute inset-y-0 left-1/2 w-px bg-on-ink/90" />
                    </span>
                    {site.photoUrl ? (
                      <span className="absolute right-2 bottom-2 hidden aspect-[16/9] w-[38%] overflow-hidden rounded-sm border border-on-ink/60 sm:block">
                        <Image src={site.photoUrl} alt={`Street view of ${site.address}`} fill sizes="12vw" className="object-cover" />
                      </span>
                    ) : null}
                  </div>
                </ViewTransition>
                <figcaption className="mt-1 font-mono text-[0.6875rem] text-on-ink-2">src Vexcel ortho{site.photoUrl ? "; inset CoStar photo" : ""}</figcaption>
              </figure>
            ) : site.photoUrl ? (
              <figure className="m-0 hidden sm:block">
                <div className="relative aspect-[16/9] overflow-hidden rounded-sm border border-on-ink/25 bg-on-ink/10">
                  <Image src={site.photoUrl} alt={`Street view of ${site.address}`} fill priority sizes="(min-width: 1024px) 30vw, 100vw" className="object-cover" />
                </div>
                <figcaption className="mt-1 font-mono text-[0.6875rem] text-on-ink-2">src CoStar photo</figcaption>
              </figure>
            ) : null}
            <p className="hero-fade text-sm text-on-ink-2" style={d(460)}>
              {s.spaceType ? <span className="font-semibold text-on-ink">{SPACE_TYPE[s.spaceType] ?? s.spaceType}. </span> : null}
              {s.availableOn ? `Available since ${s.availableOn.slice(0, 7)}. ` : ""}
            </p>
            {notes ? (
              <blockquote className="hero-fade border-t border-on-ink/25 pt-3 text-sm leading-snug text-on-ink-2" style={d(520)}>
                <span className="font-semibold text-on-ink">The listing says: </span>
                <span className="line-clamp-4">“{notes}”</span>
              </blockquote>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

function Cell({
  i,
  label,
  value,
  unit,
  note,
  src,
  estimate,
}: {
  i: number;
  label: string;
  value: ReactNode;
  unit?: string;
  note?: string;
  src?: string;
  estimate?: boolean;
}) {
  return (
    <div className="hero-fade flex flex-col gap-1 border-b border-on-ink/25 py-3 pr-3 sm:border-r sm:border-b-0 sm:pl-3 sm:first:pl-0 sm:last:border-r-0" style={d(420 + i * 60)}>
      <dt className="text-xs font-medium uppercase tracking-[0.06em] text-on-ink-2">{label}</dt>
      <dd className="lettering text-[1.75rem] font-semibold leading-none">
        {value}
        {unit ? <span className="ml-0.5 text-base font-medium text-on-ink-2">{unit}</span> : null}
      </dd>
      {note ? <dd className="text-xs text-on-ink-2">{note}</dd> : null}
      <dd>
        {estimate ? (
          <Estimate className="border-on-ink/40 text-on-ink-2" />
        ) : src ? (
          <Src className="text-on-ink-2">{src}</Src>
        ) : null}
      </dd>
    </div>
  );
}
