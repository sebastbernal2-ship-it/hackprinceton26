"use client";

import type { ActItem } from "../lib/act";

export default function ActChecklist({ items, title = "Act: diligence and negotiation checklist" }: { items: ActItem[]; title?: string }) {
  const groups = [...new Set(items.map((i) => i.group))];
  return (
    <section className="mt-8 rounded-[1.75rem] border border-foreground/15 p-6 sm:p-8" aria-labelledby="act-title" data-testid="act-checklist">
      <p className="text-xs text-foreground/50">Step 6 · Act checklist</p>
      <h2 id="act-title" className="text-lg font-medium tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-foreground/50">
        What to ask for and verify before relying on any number here. Check items off as you confirm them; this list comes from fixed rules and asserts nothing about the space.
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
