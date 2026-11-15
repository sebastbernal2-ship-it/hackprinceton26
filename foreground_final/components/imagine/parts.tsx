"use client";

import { Check as CheckIcon, ChevronRight } from "lucide-react";
import { Estimate, SourceLabel } from "@/components/site/primitives";
import { Tween, TweenRange } from "@/components/site/tween";
import type { Range } from "@/lib/engine/types";
import type { Assessment, Change, Check, SourceRef, Status } from "@/lib/feasibility/types";
import { STAGES, type ImagineVersion, type Stage } from "@/lib/imagine/types";
import type { VersionDiff } from "@/lib/imagine/versions";
import { num, usd, usdRange } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RunState } from "./use-imagine";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";
/** A row or block arriving: 8px rise and fade, staggered by --i. Reduced motion keeps the fade only. */
export const ARRIVE = `transition-[opacity,translate] duration-300 ${EASE} delay-[calc(var(--i,0)*50ms)] starting:translate-y-2 starting:opacity-0 motion-reduce:starting:translate-y-0`;
export const arriveAt = (i: number) => ({ "--i": Math.min(i, 8) }) as React.CSSProperties;

/** Provenance: a solid src line for cited data, the dashed mark for our own estimates. */
export function Provenance({ source, className }: { source: SourceRef; className?: string }) {
  if (source.url)
    return (
      <a href={source.url} target="_blank" rel="noreferrer" className={cn("font-mono text-[0.6875rem] leading-tight text-ink-2 underline hover:text-ink", className)}>
        <span aria-hidden>src </span>
        <span className="sr-only">Source: </span>
        {source.label}
      </a>
    );
  return <SourceLabel source={source.label} className={className} />;
}

const STAGE_TEXT: Record<Stage, [string, string]> = {
  plan: ["Plan", "Reading the change"],
  checks: ["Checks", "Running code checks"],
  numbers: ["Numbers", "Re-pricing the build-out"],
  images: ["Images", "Drawing it on the room photo"],
  qa: ["QA", "Checking the picture against the room"],
};

/** The run as a survey line: a tick per stage, filled as each one lands. */
export function StageProgress({ run }: { run: RunState }) {
  const active = run.stage ? STAGE_TEXT[run.stage][1] : "";
  return (
    <div className="flex flex-col gap-2" role="status" aria-live="polite">
      <ol className="grid grid-cols-5">
        {STAGES.map((s) => {
          const done = run.done.includes(s);
          const now = run.stage === s && !done;
          return (
            <li key={s} className="relative flex flex-col gap-1.5 pt-3">
              <span aria-hidden className="absolute inset-x-0 top-1 h-px bg-rule-strong" />
              <span aria-hidden className={cn("absolute inset-x-0 top-1 h-px origin-left bg-ink transition-transform duration-500", EASE, done ? "scale-x-100" : "scale-x-0")} />
              <span aria-hidden className={cn("absolute top-0 left-0 h-2.5 w-px bg-ink", now && "motion-safe:animate-pulse")} />
              <span className={cn("text-xs font-medium uppercase tracking-[0.06em]", done || now ? "text-ink" : "text-ink-2")}>{STAGE_TEXT[s][0]}</span>
              <span className="font-mono text-[0.6875rem] text-ink-2">{done && run.timings[s] !== undefined ? `${(run.timings[s]! / 1000).toFixed(1)} s` : now ? "…" : " "}</span>
            </li>
          );
        })}
      </ol>
      <p className="text-sm text-ink-2">{active ? `${active}…` : ""}</p>
    </div>
  );
}

const STATUS: Record<Status, { text: string; cls: string }> = {
  "likely-fine": { text: "Likely fine", cls: "border-saved text-saved" },
  "needs-professional": { text: "Needs a professional", cls: "border-dashed border-maybe-ink text-maybe-ink" },
  "likely-blocker": { text: "Likely blocker", cls: "border-needed bg-needed text-on-ink" },
};

export function StatusChip({ status }: { status: Status }) {
  const s = STATUS[status];
  return <span className={cn("inline-block rounded-sm border px-1.5 py-px text-xs font-medium uppercase tracking-[0.06em] whitespace-nowrap", s.cls)}>{s.text}</span>;
}

const KIND: Record<Change["kind"], string> = { layout: "Layout", wall: "Wall", ceiling: "Ceiling", finish: "Finish", storefront: "Storefront", exterior: "Outside", equipment: "Equipment", use: "Concept" };

type Field = { key: keyof Change["quantities"]; label: string; unit: string; max: number };
const FIELDS: Record<Change["kind"], Field[]> = {
  wall: [{ key: "lengthFt", label: "Opening", unit: "ft", max: 100 }],
  ceiling: [
    { key: "heightFt", label: "Height", unit: "ft", max: 40 },
    { key: "areaSf", label: "Area", unit: "SF", max: 20000 },
  ],
  finish: [{ key: "areaSf", label: "Area", unit: "SF", max: 20000 }],
  storefront: [{ key: "lengthFt", label: "Width", unit: "ft", max: 200 }],
  exterior: [{ key: "areaSf", label: "Area", unit: "SF", max: 5000 }],
  equipment: [{ key: "count", label: "Pieces", unit: "", max: 40 }],
  layout: [{ key: "runFt", label: "Drain run", unit: "ft", max: 300 }],
  use: [],
};

/** The change list: each line can be re-measured or switched off; checks and costs follow at once. */
export function ChangeList({ version, onEdit }: { version: ImagineVersion; onEdit: (changeId: string, next: Partial<Pick<Change, "enabled" | "quantities">>) => void }) {
  const lines = new Map(version.assessment.lines.map((l) => [l.changeId, l]));
  return (
    <ul className="border-t border-rule-strong">
      {version.changeSpec.changes.map((c, i) => {
        const line = lines.get(c.id);
        return (
          <li key={c.id} style={arriveAt(i)} className={cn("grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 border-b border-rule py-3 @2xl:grid-cols-[auto_1fr_auto]", ARRIVE)}>
            <label className="relative mt-0.5 flex size-6 cursor-pointer items-center justify-center">
              <input type="checkbox" checked={c.enabled} onChange={(e) => onEdit(c.id, { enabled: e.target.checked })} className="peer absolute inset-0 cursor-pointer appearance-none rounded-sm border border-rule-strong bg-paper transition-colors duration-150 checked:border-ink checked:bg-ink hover:border-ink" />
              <CheckIcon aria-hidden className="pointer-events-none relative size-4 text-on-ink opacity-0 peer-checked:opacity-100" strokeWidth={3} />
              <span className="sr-only">Include: {c.target}</span>
            </label>
            <div className={cn("min-w-0 transition-opacity duration-200", !c.enabled && "opacity-55")}>
              <p className="font-medium">
                <span className="mr-2 text-xs font-medium uppercase tracking-[0.06em] text-ink-2">{KIND[c.kind]}</span>
                <span className={cn(!c.enabled && "line-through")}>{c.target}</span>
              </p>
              <p className="text-sm text-ink-2">{c.detail}</p>
              {FIELDS[c.kind].length && c.enabled ? (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                  {FIELDS[c.kind].map((f) => (
                    <label key={f.key} className="flex items-center gap-2 text-xs text-ink-2">
                      {f.label}
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={f.max}
                        placeholder="auto"
                        defaultValue={c.quantities[f.key] ?? ""}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          onEdit(c.id, { quantities: { [f.key]: e.target.value === "" || !Number.isFinite(v) || v <= 0 ? undefined : Math.min(v, f.max) } });
                        }}
                        className="h-9 w-20 rounded-sm border border-rule-strong bg-paper px-2 text-sm text-ink transition-colors duration-150 placeholder:text-ink-2/70 hover:border-ink"
                      />
                      {f.unit}
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
            <div className={cn("col-start-2 flex flex-col gap-0.5 @2xl:col-start-3 @2xl:max-w-64 @2xl:items-end @2xl:text-right", !c.enabled && "opacity-55")}>
              {line?.range && c.enabled ? <TweenRange low={line.range.low} high={line.range.high} className="lettering text-lg font-semibold" /> : <span className="text-sm text-ink-2">{c.enabled ? "No line price" : "Switched off"}</span>}
              {line && c.enabled ? <span className="text-xs text-ink-2">{line.basis}</span> : null}
              {line?.range && c.enabled ? <Provenance source={line.source} /> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function CheckRow({ check, i }: { check: Check; i: number }) {
  return (
    <li style={arriveAt(i)} className={cn("border-b border-rule py-3", ARRIVE)}>
      <div className="grid gap-x-4 gap-y-1 @2xl:grid-cols-[11rem_1fr_auto]">
        <div>
          <StatusChip status={check.status} />
        </div>
        <div className="min-w-0">
          <p className="font-medium">{check.label}</p>
          <p className="text-sm text-ink-2">{check.summary}</p>
        </div>
        <div className="flex flex-col gap-0.5 @2xl:max-w-56 @2xl:items-end @2xl:text-right">
          {check.cost ? (
            <>
              <span className={cn("lettering text-lg font-semibold", !check.cost.counted && "text-ink-2")}>{usdRange(check.cost.range)}</span>
              <span className="text-xs text-ink-2">{check.cost.counted ? "Added to the total" : "Not in the total"}</span>
              <Provenance source={check.cost.source} />
            </>
          ) : (
            <span className="text-sm text-ink-2">No added cost</span>
          )}
        </div>
      </div>
      <details className="group mt-2 @2xl:ml-[12rem]">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1 py-1 font-mono text-[0.6875rem] text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
          <ChevronRight aria-hidden className="size-3.5 transition-transform duration-150 group-open:rotate-90" />
          {check.citations.map((c) => c.code).join(" · ")}
        </summary>
        <div className="mt-1 flex max-w-prose flex-col gap-2 pb-1 text-sm">
          <p>{check.detail}</p>
          {check.cost ? <p className="text-ink-2">{check.cost.note}</p> : null}
          {check.professional ? (
            <p>
              <span className="text-xs font-medium uppercase tracking-[0.06em] text-ink-2">Who to call </span>
              {check.professional}
            </p>
          ) : null}
          <ul className="flex flex-col gap-1.5">
            {check.citations.map((c) => (
              <li key={c.code} className="flex flex-col">
                <span>
                  <span className="font-medium">{c.code}</span> {c.text}
                </span>
                <Provenance source={c.source} />
              </li>
            ))}
          </ul>
        </div>
      </details>
    </li>
  );
}

export function ChecksList({ assessment }: { assessment: Assessment }) {
  if (assessment.checks.length === 0)
    return <p className="border-y border-rule py-3 text-sm text-ink-2">No code checks are triggered by these changes. Finishes and furniture alone usually need no permit; confirm with the landlord.</p>;
  return (
    <ul className="border-t border-rule-strong">
      {assessment.checks.map((c, i) => (
        <CheckRow key={c.id} check={c} i={i} />
      ))}
    </ul>
  );
}

const weeks = (r: { low: number; high: number }) => (Math.round(r.low) === Math.round(r.high) ? `${num(r.low)} wk` : `${num(r.low)}–${num(r.high)} wk`);

export function Permits({ assessment }: { assessment: Assessment }) {
  const t = assessment.time;
  return (
    <div className="flex flex-col gap-3">
      {assessment.permits.length ? (
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Permits these changes need in {assessment.city}, with typical review time</caption>
          <thead>
            <tr className="border-b border-rule-strong text-xs uppercase tracking-[0.06em] text-ink-2">
              <th scope="col" className="py-2 font-medium">Permit or review</th>
              <th scope="col" className="py-2 text-right font-medium">Typical wait</th>
            </tr>
          </thead>
          <tbody>
            {assessment.permits.map((p) => (
              <tr key={p.id} className="border-b border-rule align-top">
                <th scope="row" className="py-2 pr-4 font-normal">
                  <span className="font-medium">{p.label}</span>
                  <span className="block text-xs text-ink-2">
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noreferrer" className="underline hover:text-ink">
                        {p.agency}
                      </a>
                    ) : (
                      p.agency
                    )}
                  </span>
                </th>
                <td className="py-2 text-right whitespace-nowrap">
                  {weeks(p.weeks)}
                  <span className="block">
                    <Provenance source={p.source} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="border-y border-rule py-3 text-sm text-ink-2">No permit expected for these changes.</p>
      )}
      <p className="text-sm text-ink-2">
        <span className="font-medium text-ink">
          Adds {weeks(t.totalWeeks)} to opening
        </span>{" "}
        ({weeks(t.permitWeeks)} of permits, {weeks(t.workWeeks)} of work). {t.basis} <Estimate />
      </p>
      <p className="font-mono text-[0.6875rem] text-ink-2">{assessment.codeBasis}</p>
    </div>
  );
}

const signed = (n: number, fmt: (n: number) => string) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmt(Math.abs(n))}`;
const VERDICT = { comfortable: "Comfortable", stretch: "A stretch", unlikely: "Unlikely" } as const;

function Pair({ label, before, after, note }: { label: string; before: string; after: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium uppercase tracking-[0.06em] text-ink-2">{label}</dt>
      <dd className="lettering text-2xl font-semibold leading-none">{after}</dd>
      <dd className="text-xs text-ink-2">
        was {before} {note}
      </dd>
    </div>
  );
}

/** Cost and break-even delta: what the imagined version adds to the build-out, and what that does to the business. */
export function NumbersDelta({ version, diff, against }: { version: ImagineVersion; diff: VersionDiff | null; against: string | null }) {
  const { before: b, after: a } = version.numbers;
  const d = version.costDelta;
  const flat = Math.round(d.low) === 0 && Math.round(d.high) === 0;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.06em] text-ink-2">Added to the build-out</p>
        <p className={cn("lettering text-[2.75rem] font-bold leading-none", !flat && d.mid > 0 && "text-needed", d.mid < 0 && "text-saved")}>
          {flat ? "$0" : <>{d.low >= 0 ? "+" : ""}<TweenRange low={d.low} high={d.high} /></>}
        </p>
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-sm text-ink-2">
          <Estimate /> Change lines plus the checks counted below, on top of the space as scanned.
          {a.overBudget ? <span className="font-medium text-needed">Over your budget at the midpoint.</span> : null}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 @2xl:grid-cols-4">
        <Pair label="Build-out total" before={usdRange(b.total)} after={<TweenRange low={a.total.low} high={a.total.high} />} note={<Estimate />} />
        <Pair
          label="Break-even turns / day"
          before={num(b.turnsPerDay, 1)}
          after={<Tween value={a.turnsPerDay} kind="dec1" />}
          note={<span>· {VERDICT[a.verdict]}, {num(a.coversPerDay)} covers on {num(a.seats)} seats</span>}
        />
        <Pair
          label="Payback, base case"
          before={b.paybackYears === null ? "never" : `${num(b.paybackYears, 1)} yr`}
          after={a.paybackYears === null ? "Never" : <><Tween value={a.paybackYears} kind="dec1" /> yr</>}
          note={<span>· year-3 cash {usd(a.year3CashUsd)}</span>}
        />
        <Pair
          label="Time to open"
          before={`${num(b.monthsToOpen.low)}–${num(b.monthsToOpen.high)} mo`}
          after={<><Tween value={a.monthsToOpen.low} kind="dec1" />–<Tween value={a.monthsToOpen.high} kind="dec1" /> mo</>}
          note={<Estimate />}
        />
      </dl>
      <p className="max-w-prose text-sm">{version.numbers.outlook}</p>
      {diff && against ? (
        <p className="border-t border-rule pt-3 text-sm">
          <span className="text-xs font-medium uppercase tracking-[0.06em] text-ink-2">Against {against} </span>
          {signed(diff.cost.mid, (n) => usd(n))} build-out at the midpoint, {signed(diff.weeks.high, (n) => `${num(n)} wk`)} at the long end
          {diff.paybackYears !== null ? `, ${signed(diff.paybackYears, (n) => `${num(n, 1)} yr`)} payback` : ""}
          {diff.checksAdded.length ? `; new checks: ${diff.checksAdded.join(", ")}` : ""}
          {diff.checksCleared.length ? `; no longer triggered: ${diff.checksCleared.join(", ")}` : ""}.
        </p>
      ) : null}
    </div>
  );
}

export type { Range };
