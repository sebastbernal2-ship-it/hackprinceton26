import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { RevealSection } from "./reveal";

/** A number's provenance. Every figure on the page carries one of these. */
export function Src({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("font-mono text-[0.6875rem] leading-tight text-ink-2", className)}>
      <span aria-hidden>src </span>
      <span className="sr-only">Source: </span>
      {children}
    </span>
  );
}

const ESTIMATE = /\bestimate[ds]?\b/i;

/** Renders a source string; sources that call themselves estimates get the estimate mark. */
export function SourceLabel({ source, className }: { source: string; className?: string }) {
  if (ESTIMATE.test(source)) {
    const rest = /^estimate\b/i.test(source) ? source.replace(/^estimate\b/i, "").replace(/^[\s,;:–—-]+/, "") : source;
    return (
      <span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5", className)}>
        <Estimate />
        {rest ? <span className="font-mono text-[0.6875rem] leading-tight text-ink-2">{rest}</span> : null}
      </span>
    );
  }
  return <Src className={className}>{source}</Src>;
}

export function Estimate({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded-sm border border-dashed border-rule-strong px-1 font-mono text-[0.625rem] uppercase leading-[1.4] tracking-wide text-ink-2",
        className,
      )}
    >
      estimate
    </span>
  );
}

export function Section({
  id,
  title,
  aside,
  children,
  className,
}: {
  id: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <RevealSection id={id} labelledBy={`${id}-h`} className={cn("pt-5 pb-14", className)}>
      <div className="survey-head mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 id={`${id}-h`} className="lettering text-[1.75rem] font-semibold leading-none sm:text-[2rem]">
          {title}
        </h2>
        {aside ? <div className="text-sm text-ink-2">{aside}</div> : null}
      </div>
      <div className="survey-body">{children}</div>
    </RevealSection>
  );
}

export function Empty({ title, children, className }: { title: string; children?: ReactNode; className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        "flex min-h-40 flex-col items-start justify-center gap-1 rounded-sm border border-dashed border-rule-strong bg-paper-2/60 p-5",
        className,
      )}
    >
      <p className="font-medium">{title}</p>
      {children ? <p className="max-w-prose text-sm text-ink-2">{children}</p> : null}
    </div>
  );
}

export function Fact({
  label,
  value,
  note,
  className,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <dt className="text-xs font-medium uppercase tracking-[0.06em] text-ink-2">{label}</dt>
      <dd className="lettering text-2xl font-semibold leading-none">{value}</dd>
      {note ? <dd className="text-xs">{note}</dd> : null}
    </div>
  );
}

export const STATUS_TEXT = {
  needed: "You pay",
  saved: "Already there",
  maybe: "Unknown",
} as const;

export const STATUS_COLOR = {
  needed: "var(--needed)",
  saved: "var(--saved)",
  maybe: "var(--maybe)",
} as const;
