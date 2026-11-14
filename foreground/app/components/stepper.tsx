export const STEPS = ["Intake", "Shortlist", "Inspect", "Project layout", "Quantify", "Act checklist", "Re-plan"] as const;

/** `active` is the 0-based step the user is on; earlier steps show as reached. */
export default function Stepper({ active }: { active: number }) {
  return (
    <ol aria-label="Workflow" className="flex flex-wrap gap-x-1 gap-y-2 text-xs">
      {STEPS.map((label, i) => (
        <li key={label} aria-current={i === active ? "step" : undefined} className="flex items-center gap-1">
          <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 ${i === active ? "bg-foreground text-background" : i < active ? "bg-match-soft text-match" : "border border-foreground/15 text-foreground/50"}`}>
            <span className="tabular-nums">{i + 1}</span>
            {label}
          </span>
          {i < STEPS.length - 1 && <span aria-hidden className="text-foreground/25">›</span>}
        </li>
      ))}
    </ol>
  );
}
