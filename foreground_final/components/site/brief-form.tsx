import Form from "next/form";
import type { OwnerBrief } from "@/lib/engine/types";

const CONCEPTS: { value: OwnerBrief["concept"]; label: string }[] = [
  { value: "quick-service", label: "Quick service" },
  { value: "fast-casual", label: "Fast casual" },
  { value: "full-service", label: "Full service" },
  { value: "cafe", label: "Cafe" },
  { value: "bar", label: "Bar" },
];

const field =
  "h-9 rounded-sm border border-rule-strong bg-paper px-2 text-sm text-ink transition-colors hover:border-ink focus-visible:border-ink";

/** GET form with client navigation: the server re-runs the analysis and the vessel re-flows instead of reloading. */
export function BriefForm({ brief, action }: { brief: OwnerBrief; action: string }) {
  return (
    <Form action={action} scroll={false} className="flex flex-wrap items-end gap-x-3 gap-y-2" aria-label="Your plan">
      <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
        Concept
        <select name="concept" defaultValue={brief.concept} className={field}>
          {CONCEPTS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
        Seats
        <input name="seats" type="number" inputMode="numeric" min={8} max={400} step={1} defaultValue={brief.seats ?? ""} className={`${field} w-20`} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
        Budget ($)
        <input name="budget" type="number" inputMode="numeric" min={10000} max={2000000} step={5000} defaultValue={brief.budgetUsd ?? ""} className={`${field} w-28`} />
      </label>
      <button type="submit" className="h-9 rounded-sm bg-ink px-3 text-sm font-semibold text-on-ink transition-[transform,background-color] hover:bg-ink/90 active:scale-[0.97]">
        Recalculate
      </button>
    </Form>
  );
}
