"use client";

import { buildChecklist } from "../lib/act";
import type { CostLineItem } from "../lib/costs";
import type { DefectFinding } from "../lib/inspection";
import type { FactorCard } from "../lib/matches";

export default function ActChecklist({ findings, factors, lines }: { findings: DefectFinding[]; factors: FactorCard[]; lines: CostLineItem[] }) {
  const items = buildChecklist(findings, factors, lines);
  const groups = [...new Set(items.map((i) => i.group))];
  return (
    <section className="mt-8 border-t border-foreground/10 pt-6" aria-labelledby="act-title">
      <h2 id="act-title" className="text-lg font-medium tracking-tight">Act: questions and verification checklist</h2>
      <p className="mt-1 text-sm text-foreground/50">
        Built by fixed rules from the findings, unknown factors and unpriced costs above. No AI wrote these lines.
      </p>
      {items.length === 0 && <p className="mt-3 text-sm text-foreground/60">Nothing to verify was generated. That does not mean the space is clean.</p>}
      {groups.map((group) => (
        <div key={group} className="mt-4">
          <h3 className="text-base font-medium">{group}</h3>
          <ul className="mt-2 space-y-2">
            {items.filter((i) => i.group === group).map((item) => (
              <li key={item.id}>
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" className="mt-1" />
                  <span>
                    {item.text} <span className="text-xs text-foreground/45">({item.origin})</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
