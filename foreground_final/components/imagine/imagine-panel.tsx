"use client";

import Image from "next/image";
import { useId, useRef, useState } from "react";
import { Empty } from "@/components/site/primitives";
import type { OwnerBrief } from "@/lib/engine/types";
import { DISCLAIMER, IMAGE_QUOTA_MESSAGE, type ImagineVersion } from "@/lib/imagine/types";
import { compareVersions } from "@/lib/imagine/versions";
import type { Layout, Op } from "@/lib/layout";
import type { Site } from "@/lib/sites/schema";
import { cn } from "@/lib/utils";
import { CompareSlider } from "./compare-slider";
import { ARRIVE, ChangeList, ChecksList, NumbersDelta, Permits, StageProgress, StatusChip, arriveAt } from "./parts";
import { useImagine } from "./use-imagine";

const EXAMPLES = [
  "Open the wall between the dining room and the back room",
  "Add a bar along the window",
  "Drop the ceiling to 10 ft",
  "Brick walls and concrete floors",
  "New glass storefront",
  "Add a patio",
  "Make it a coffee shop",
];

const PRESS = "transition-[background-color,border-color,color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]";

export type ImaginePanelProps = {
  site: Site;
  brief: OwnerBrief;
  /** the plan every version is measured against; read once, when the panel mounts */
  layout?: Layout | null;
  /** called with the layout ops a new version adds, and the plan after them */
  onLayoutOps?: (ops: Op[], layout: Layout | null) => void;
  /** a data URL of the view on screen (for example the 3D tour), edited instead of the site's photos */
  getScreenshot?: () => Promise<string | null>;
  className?: string;
};

/**
 * Imagine mode. Type any change to the scanned space; get a change list, feasibility checks, permits and time,
 * the cost and break-even delta, and an AI visualization on the real room photo. Every result is a version.
 * Self-contained: versions live in localStorage per site, the server is stateless.
 */
export function ImaginePanel({ site, brief, layout, onLayoutOps, getScreenshot, className }: ImaginePanelProps) {
  const [base] = useState(() => layout ?? null);
  const im = useImagine({ site, brief, baseLayout: base, onLayoutOps, getScreenshot });
  const [text, setText] = useState("");
  const [compareId, setCompareId] = useState<string>("scan");
  const inputId = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const running = im.run.status === "running";
  const v = im.current;
  const other = compareId === "scan" ? null : (im.versions.find((x) => x.id === compareId && x.id !== v?.id) ?? null);

  const submit = (value: string) => {
    if (running || value.trim().length < 3) return;
    void im.start(value);
    setText("");
  };

  return (
    <section aria-labelledby={`${inputId}-h`} className={cn("@container flex flex-col gap-6", className)}>
      <header className="flex flex-col gap-1">
        <h2 id={`${inputId}-h`} className="lettering text-[1.75rem] font-semibold leading-none">
          Imagine a change
        </h2>
        <p className="max-w-prose text-ink-2">Say what you would change, inside or out. You get the code checks, permits, cost and a picture on the real room.</p>
      </header>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <label htmlFor={inputId} className="text-xs font-medium uppercase tracking-[0.06em] text-ink-2">
          {v ? `Next change, on top of version ${v.label}` : "Your change, starting from the space as scanned"}
        </label>
        <div className="flex flex-col gap-2 @xl:flex-row">
          <textarea
            id={inputId}
            ref={field}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(text);
              }
            }}
            rows={2}
            maxLength={500}
            placeholder="Open the wall between the dining room and the back room"
            className="min-h-[4.5rem] flex-1 resize-y rounded-sm border border-rule-strong bg-paper px-3 py-2 text-base text-ink transition-colors duration-150 placeholder:text-ink-2/80 hover:border-ink"
          />
          {running ? (
            <button type="button" onClick={im.stop} className={cn("h-11 rounded-sm border border-ink px-4 text-sm font-semibold hover:bg-paper-2 @xl:self-start", PRESS)}>
              Stop
            </button>
          ) : (
            <button type="submit" disabled={text.trim().length < 3} className={cn("h-11 rounded-sm bg-ink px-4 text-sm font-semibold text-on-ink hover:bg-ink/90 disabled:pointer-events-none disabled:opacity-50 @xl:self-start", PRESS)}>
              Imagine it
            </button>
          )}
        </div>
        <ul className="flex flex-wrap gap-2" aria-label="Examples">
          {EXAMPLES.map((ex) => (
            <li key={ex}>
              <button
                type="button"
                disabled={running}
                onClick={() => {
                  setText(ex);
                  field.current?.focus();
                }}
                className={cn("min-h-9 rounded-sm border border-rule-strong px-2.5 py-1 text-left text-sm text-ink-2 hover:border-ink hover:text-ink disabled:pointer-events-none disabled:opacity-50", PRESS)}
              >
                {ex}
              </button>
            </li>
          ))}
        </ul>
      </form>

      {running ? <StageProgress run={im.run} /> : null}
      {im.run.status === "error" ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-ink px-4 py-3">
          <p className="text-sm">{im.run.error}</p>
          <button type="button" onClick={() => submit(im.run.instruction)} className={cn("h-9 rounded-sm border border-ink px-3 text-sm font-semibold hover:bg-paper-2", PRESS)}>
            Try again
          </button>
        </div>
      ) : null}

      {im.versions.length ? (
        <nav aria-label="Versions" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-rule py-2">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <VersionButton label="Scan" title="The space as scanned. Your next change starts a new line." pressed={!v} onClick={() => im.select(null)} />
            </li>
            {im.versions.map((x) => (
              <li key={x.id} className="flex items-center gap-1.5">
                <span aria-hidden className={cn("h-px w-3", x.parentId ? "bg-ink" : "bg-transparent")} />
                <VersionButton label={x.label} title={x.instruction} pressed={v?.id === x.id} onClick={() => im.select(x.id)} worst={x.assessment.worst} />
              </li>
            ))}
          </ol>
          {v ? (
            <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <label className="flex items-center gap-2 text-ink-2">
                Compare with
                <select value={other ? other.id : "scan"} onChange={(e) => setCompareId(e.target.value)} className="h-9 rounded-sm border border-rule-strong bg-paper px-2 text-ink hover:border-ink">
                  <option value="scan">Scan</option>
                  {im.versions
                    .filter((x) => x.id !== v.id)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.label}
                      </option>
                    ))}
                </select>
              </label>
              <button type="button" disabled={running} onClick={() => im.undo(v.id)} className="min-h-9 text-ink-2 underline hover:text-ink disabled:pointer-events-none disabled:opacity-50">
                Undo {v.label}
                {im.versions.some((x) => x.parentId === v.id) ? " and what follows" : ""}
              </button>
            </div>
          ) : null}
        </nav>
      ) : null}

      {v ? <Result key={v.id} v={v} other={other} imagesPending={running && im.run.instruction === v.instruction && !im.run.done.includes("images")} onEdit={(id, next) => im.editChange(v.id, id, next)} /> : null}
      {!v && !running ? (
        <Empty title={im.versions.length ? "The space as scanned" : "Nothing imagined yet"}>
          {im.versions.length
            ? "Your next change starts a new version line from the scan. Pick a version above to build on it instead."
            : "Each change becomes a version (A, then A1, A2) with its checks, permits, cost and picture. Versions are kept in this browser."}
        </Empty>
      ) : null}
    </section>
  );
}

function VersionButton({ label, title, pressed, onClick, worst }: { label: string; title: string; pressed: boolean; onClick: () => void; worst?: ImagineVersion["assessment"]["worst"] }) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn("lettering flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-sm border border-rule-strong px-2.5 font-semibold hover:border-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-on-ink", PRESS)}
    >
      {label}
      {worst && worst !== "likely-fine" ? <span aria-hidden className={cn("size-1.5 rounded-full", worst === "likely-blocker" ? "bg-needed" : "bg-maybe")} /> : null}
      {worst ? <span className="sr-only">, {worst.replace("-", " ")}</span> : null}
    </button>
  );
}

function Result({ v, other, imagesPending, onEdit }: { v: ImagineVersion; other: ImagineVersion | null; imagesPending: boolean; onEdit: Parameters<typeof ChangeList>[0]["onEdit"] }) {
  const [viewIndex, setViewIndex] = useState(0);
  const image = v.images[Math.min(viewIndex, v.images.length - 1)] ?? null;
  const qa = v.qa?.views.find((q) => q.view === image?.view);
  const flags = v.changeSpec.structuralFlags;
  const diff = compareVersions(other, v);
  const drawn = v.images.some((i) => i.imagined);

  return (
    <div className="flex flex-col gap-10">
      <div style={arriveAt(0)} className={cn("flex flex-col gap-3", ARRIVE)}>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="lettering text-xl font-semibold">Version {v.label}</span>
          <StatusChip status={v.assessment.worst} />
          {v.plannedBy === "offline" ? <span className="font-mono text-[0.6875rem] text-ink-2">read offline; the planner was unreachable</span> : null}
        </p>
        <p className="max-w-prose text-lg leading-snug">{v.changeSpec.summary || v.instruction}</p>
        {flags.length ? (
          <div className="rounded-sm border border-dashed border-maybe-ink px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.06em] text-maybe-ink">Before this is real</p>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-sm">
              {flags.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {v.notes.length ? <p className="text-sm text-ink-2">On the plan: {v.notes.join(" ")}</p> : null}
      </div>

      <div className="grid gap-x-10 gap-y-10 @4xl:grid-cols-12">
        <div style={arriveAt(1)} className={cn("@4xl:col-span-7", ARRIVE)}>
          <NumbersDelta version={v} diff={other || v.parentId ? diff : null} against={other ? `version ${other.label}` : "the scan"} />
        </div>

        <div style={arriveAt(2)} className={cn("flex flex-col gap-3 @4xl:col-span-5", ARRIVE)}>
          {image ? (
            <CompareSlider key={image.view} layers={{ scanned: image.scanned, empty: image.empty, imagined: image.imagined }} caption={image.caption} />
          ) : imagesPending ? (
            <div role="status" className="relative flex aspect-[4/3] items-end overflow-hidden rounded-sm border border-dashed border-rule-strong bg-paper-2/60 p-4">
              <span aria-hidden className="scan-sweep absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-transparent to-ink/10 motion-reduce:hidden" />
              <p className="text-sm text-ink-2">Drawing the change on the room photo. Checks and costs are ready below.</p>
            </div>
          ) : (
            <Empty title={v.imageError ? IMAGE_QUOTA_MESSAGE : "No picture for this change"}>
              {v.imageError ? (v.imageError.code === "image_quota" || v.imageError.code === "no_key" ? "The image model is out of quota right now. Everything else on this version is complete." : v.imageError.message) : "This change does not show in a room photo. The checks and costs still apply."}
            </Empty>
          )}
          {image && !image.imagined && !imagesPending ? <p className="text-sm text-ink-2">{image.error?.code === "image_quota" ? IMAGE_QUOTA_MESSAGE : (image.error?.message ?? "This view could not be drawn.")}.</p> : null}
          {v.images.length > 1 ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Camera position">
              {v.images.map((img, i) => (
                <button key={img.view} type="button" aria-pressed={img.view === image?.view} onClick={() => setViewIndex(i)} className={cn("relative h-14 w-20 overflow-hidden rounded-sm border border-rule-strong hover:border-ink aria-pressed:border-2 aria-pressed:border-ink", PRESS)}>
                  <Image src={img.imagined ?? img.empty ?? img.scanned ?? ""} alt={`${img.caption}${img.imagined ? ", imagined" : ""}`} fill unoptimized sizes="80px" className="object-cover" />
                </button>
              ))}
            </div>
          ) : null}
          {drawn ? (
            <p className="text-sm text-ink-2">
              <span className="font-medium text-ink">{DISCLAIMER}.</span>{" "}
              {qa ? (
                <>
                  <span className={cn("font-medium", qa.ok ? "text-ink" : "text-maybe-ink")}>{qa.ok ? "Picture check passed." : qa.impossibleGeometry ? "Picture check: geometry may not be buildable." : qa.outsideRegion ? "Picture check: the edit touched more than was asked." : "Picture check: the change is hard to see."}</span> {qa.note}
                </>
              ) : v.qa && !v.qa.checked ? (
                "The picture could not be checked against the original."
              ) : null}
            </p>
          ) : null}
        </div>
      </div>

      <div style={arriveAt(3)} className={cn("flex flex-col gap-3", ARRIVE)}>
        <h3 className="lettering text-xl font-semibold">What changes</h3>
        <ChangeList version={v} onEdit={onEdit} />
      </div>

      <div className="grid gap-x-10 gap-y-10 @4xl:grid-cols-12">
        <div style={arriveAt(4)} className={cn("flex flex-col gap-3 @4xl:col-span-7", ARRIVE)}>
          <h3 className="lettering text-xl font-semibold">Feasibility checks</h3>
          <ChecksList assessment={v.assessment} />
        </div>
        <div style={arriveAt(5)} className={cn("flex flex-col gap-3 @4xl:col-span-5", ARRIVE)}>
          <h3 className="lettering text-xl font-semibold">Permits and time</h3>
          <Permits assessment={v.assessment} />
        </div>
      </div>
    </div>
  );
}
