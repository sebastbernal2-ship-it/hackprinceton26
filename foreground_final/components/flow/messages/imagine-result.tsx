/* eslint-disable @next/next/no-img-element -- generated faces live under /media, outside next/image's optimizer */
"use client";

import { PANO_DISCLAIMER } from "@/lib/immersive/imagine-types";
import { cn } from "@/lib/utils";
import { TONE_CHIP } from "./walk-step";
import { usdRange } from "@/lib/format";
import type { MessageRendererProps } from "./registry";

function Thumb({ src, label }: { src?: string; label: string }) {
  return (
    <figure className="m-0 flex flex-col gap-1">
      <div className="h-[132px] w-[176px] max-w-full overflow-hidden rounded-f-sm bg-[oklch(1_0_0/0.06)]">
        {src ? <img src={src} alt={`${label} view of the room`} className="size-full object-cover" /> : null}
      </div>
      <span className="flow-label text-text-2">{label}</span>
    </figure>
  );
}

const STATUS_DOT = { "likely-fine": "bg-saved", "needs-professional": "bg-maybe", "likely-blocker": "bg-needed" } as const;
const STATUS_WORD = { "likely-fine": "Likely fine", "needs-professional": "Needs a professional", "likely-blocker": "Likely blocker" } as const;

/** The real cost delta of the change, in words: about $X to build, saves about $X, or nothing added. */
function deltaLabel(r: { low: number; high: number }): string {
  if (r.high <= 0 && r.low >= 0) return "No added build cost";
  if (r.high <= 0) return `Saves about ${usdRange({ low: -r.high, high: -r.low })}`;
  return `About ${usdRange(r)} to build`;
}

/** A room reimagined in 360: stage while it runs, before / after when done, an honest error otherwise. */
export function ImagineResultMessage({ message: m }: MessageRendererProps<"imagineResult">) {
  return (
    <div className="flex flex-col gap-3">
      <p className="flow-label text-text-2">Imagine: {m.instruction}</p>
      {m.status === "running" ? (
        <p className="flow-chat flow-shimmer text-text" role="status">
          {m.stage ?? "Getting this room ready"}
        </p>
      ) : null}
      {m.status === "error" ? (
        <p role="alert" className="flow-chat text-text">
          {m.error ?? "Could not imagine this room."} Walking and costs still work.
        </p>
      ) : null}
      {m.beforeUrl && m.status !== "error" ? (
        <div className="flex flex-wrap gap-2">
          <Thumb src={m.beforeUrl} label="Scanned" />
          <Thumb src={m.afterUrl} label={m.status === "done" ? "Imagined" : "Imagining"} />
        </div>
      ) : null}
      {m.status === "done" ? (
        <p className="text-sm text-text-2">Hold the pill at the top of the scene to see the room before. {m.note}</p>
      ) : null}
      {m.feasibility === "loading" ? (
        <p className="flow-label flow-shimmer text-text-2" role="status">
          Checking code, permits and cost for this change
        </p>
      ) : null}
      {m.costDeltaUsd ? (
        <p className={cn("flow-label w-fit rounded-full px-3 py-1", TONE_CHIP[m.tone])}>{deltaLabel(m.costDeltaUsd)}</p>
      ) : null}
      {m.feasibility === "none" && m.feasibilityNote ? <p className="text-sm text-text-2">{m.feasibilityNote}</p> : null}
      {m.checks?.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {m.checks.map((c) => (
            <li key={c.id} className="flex flex-col gap-0.5">
              <span className="flex items-center gap-2 text-sm text-text">
                <span aria-hidden className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[c.status])} />
                <span className="font-medium">{c.label}</span>
                <span className="sr-only">{STATUS_WORD[c.status]}</span>
              </span>
              <span className="pl-4 text-sm text-text-2">{c.summary}</span>
              {c.citation ? (
                <span className="flow-source pl-4 text-text-3">
                  {c.citation.url ? (
                    <a href={c.citation.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-live">
                      {c.citation.code}
                    </a>
                  ) : (
                    c.citation.code
                  )}
                  , {c.citation.label}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {m.permitWeeks ? (
        <p className="flow-source text-text-3">
          Permits: about {m.permitWeeks.low === m.permitWeeks.high ? m.permitWeeks.high : `${m.permitWeeks.low} to ${m.permitWeeks.high}`} weeks
        </p>
      ) : null}
      <p className="flow-source text-text-3">{PANO_DISCLAIMER}</p>
    </div>
  );
}
