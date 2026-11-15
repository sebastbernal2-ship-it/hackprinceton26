export const STEPS = ["Intake", "Shortlist", "Inspect", "Project layout", "Quantify", "Act checklist", "Re-plan"] as const;

/** `active` is the 0-based step the user is on; earlier steps show as reached. With `onStep`, steps are clickable and Back/Next buttons appear. */
export default function Stepper({ active, onStep }: { active: number; onStep?: (step: number) => void }) {
  const pill = (i: number) =>
    `flex items-center gap-1.5 rounded-full px-3 py-1 ${i === active ? "bg-foreground text-background" : i < active ? "bg-match-soft text-match" : "border border-foreground/15 text-foreground/50"}`;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {onStep && (
        <button type="button" onClick={() => onStep(active - 1)} disabled={active <= 0} aria-label="Previous step"
          className="rounded-full border border-foreground/20 px-3 py-1 text-xs disabled:opacity-30">
          ← Back
        </button>
      )}
      <ol aria-label="Workflow" className="flex flex-wrap gap-x-1 gap-y-2 text-xs">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === active ? "step" : undefined} className="flex items-center gap-1">
            {onStep && i !== active ? (
              <button type="button" onClick={() => onStep(i)} className={`${pill(i)} transition-opacity hover:opacity-70`}>
                <span className="tabular-nums">{i + 1}</span>
                {label}
              </button>
            ) : (
              <span className={pill(i)}>
                <span className="tabular-nums">{i + 1}</span>
                {label}
              </span>
            )}
            {i < STEPS.length - 1 && <span aria-hidden className="text-foreground/25">›</span>}
          </li>
        ))}
      </ol>
      {onStep && (
        <button type="button" onClick={() => onStep(active + 1)} disabled={active >= STEPS.length - 1} aria-label="Next step"
          className="rounded-full bg-foreground px-3 py-1 text-xs text-background disabled:opacity-30">
          Next →
        </button>
      )}
    </div>
  );
}
