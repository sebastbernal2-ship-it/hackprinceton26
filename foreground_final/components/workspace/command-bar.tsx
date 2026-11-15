"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Command } from "cmdk";
import { Box, Building2, Calculator, Eye, Footprints, LayoutGrid, Link2, MapPin, Search, Share2, Sparkles, SlidersHorizontal, Map as MapIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { Concept, CostLine, OwnerBrief } from "@/lib/engine/types";
import { usd, usdRange } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CONCEPT_LABEL, VIEW_LABEL, VIEWS, type View } from "./url-state";

export type OtherSite = { id: string; address: string; city: string };

const VIEW_ICON: Record<View, ReactNode> = {
  walk: <Box aria-hidden />,
  plan: <LayoutGrid aria-hidden />,
  above: <MapIcon aria-hidden />,
  numbers: <Calculator aria-hidden />,
};

/**
 * Cmd-K: go to a view, jump to a finding, change the brief, open another site, run Imagine. Opens and closes with no
 * animation: it is used dozens of times a session and from the keyboard.
 */
export function CommandBar({
  open,
  onOpenChange,
  brief,
  lines,
  walkable,
  sites,
  broker,
  onView,
  onFinding,
  onBrief,
  onEditBrief,
  onSite,
  onGuide,
  onImagine,
  onShare,
  onOffer,
  onDensity,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  brief: OwnerBrief;
  lines: CostLine[];
  walkable: string[];
  sites: OtherSite[];
  broker: boolean;
  onView: (v: View) => void;
  onFinding: (l: CostLine, inWalk: boolean) => void;
  onBrief: (b: Pick<OwnerBrief, "concept" | "seats" | "budgetUsd">) => void;
  onEditBrief: () => void;
  onSite: (id: string) => void;
  onGuide: () => void;
  onImagine: () => void;
  onShare: () => void;
  onOffer: () => void;
  onDensity: () => void;
}) {
  const run = (fn: () => void) => () => {
    onOpenChange(false);
    fn();
  };
  const seats = brief.seats ?? 40;
  const budget = brief.budgetUsd ?? 250_000;
  const ranked = [...lines].filter((l) => l.status !== "saved").sort((a, b) => b.range.mid - a.range.mid);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-ink/40" />
        <DialogPrimitive.Popup className="ws-cmd fixed top-[12vh] left-1/2 z-50 w-[min(40rem,calc(100vw-1.5rem))] -translate-x-1/2 overflow-hidden rounded-sm border border-ink bg-paper text-ink outline-none">
          <DialogPrimitive.Title className="sr-only">Search and commands</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Go to a view, jump to a finding, change your plan, open another site or imagine a change.</DialogPrimitive.Description>
          <Command label="Search and commands" loop filter={match}>
            <div className="flex items-center gap-2 border-b border-rule-strong px-3">
              <Search className="size-4 shrink-0 text-ink-2" aria-hidden />
              <Command.Input autoFocus placeholder="Type a view, a cost, a site, or a change…" className="h-12 w-full bg-transparent text-base text-ink outline-none placeholder:text-ink-2" />
              <kbd className="shrink-0 rounded-[2px] border border-rule-strong px-1 font-mono text-[0.6875rem] text-ink-2">Esc</kbd>
            </div>
            <Command.List className="max-h-[min(60vh,28rem)] overflow-y-auto overscroll-contain p-1.5">
              <Command.Empty className="px-3 py-6 text-sm text-ink-2">Nothing matches. Try “hood”, “plan”, “cafe” or an address.</Command.Empty>

              <Group heading="Views">
                {VIEWS.map((v, i) => (
                  <Item key={v} value={`view ${VIEW_LABEL[v].name} ${VIEW_LABEL[v].hint}`} onSelect={run(() => onView(v))} icon={VIEW_ICON[v]} shortcut={String(i + 1)}>
                    Go to {VIEW_LABEL[v].name} <span className="text-ink-2">· {VIEW_LABEL[v].hint}</span>
                  </Item>
                ))}
                <Item value="walk me through it guided tour route" onSelect={run(onGuide)} icon={<Footprints aria-hidden />} shortcut="W">
                  Walk me through it
                </Item>
              </Group>

              <Group heading="Findings">
                {ranked.map((l) => {
                  const inWalk = Boolean(l.findingId && walkable.includes(l.findingId));
                  return (
                    <Item key={l.id} value={`finding ${l.label} ${l.kind}`} onSelect={run(() => onFinding(l, inWalk))} icon={<MapPin aria-hidden className={l.status === "needed" ? "text-needed" : "text-maybe-ink"} />}>
                      {l.label} <span className="text-ink-2">· {usdRange(l.range)}{inWalk ? " · show in 3D" : ""}</span>
                    </Item>
                  );
                })}
              </Group>

              <Group heading="Your plan">
                <Item value="edit plan brief concept seats budget" onSelect={run(onEditBrief)} icon={<SlidersHorizontal aria-hidden />}>
                  Edit your plan…
                </Item>
                {(Object.keys(CONCEPT_LABEL) as Concept[])
                  .filter((c) => c !== brief.concept)
                  .map((c) => (
                    <Item key={c} value={`make it ${CONCEPT_LABEL[c]} concept`} onSelect={run(() => onBrief({ ...brief, concept: c }))} icon={<SlidersHorizontal aria-hidden />}>
                      Make it {CONCEPT_LABEL[c].toLowerCase()}
                    </Item>
                  ))}
                <Item value="seats more add ten" onSelect={run(() => onBrief({ ...brief, seats: Math.min(400, seats + 10) }))} icon={<SlidersHorizontal aria-hidden />}>
                  {seats + 10} seats <span className="text-ink-2">· 10 more</span>
                </Item>
                <Item value="seats fewer less ten" onSelect={run(() => onBrief({ ...brief, seats: Math.max(8, seats - 10) }))} icon={<SlidersHorizontal aria-hidden />}>
                  {Math.max(8, seats - 10)} seats <span className="text-ink-2">· 10 fewer</span>
                </Item>
                {[150_000, 250_000, 400_000].filter((b) => b !== budget).map((b) => (
                  <Item key={b} value={`budget ${usd(b)}`} onSelect={run(() => onBrief({ ...brief, budgetUsd: b }))} icon={<SlidersHorizontal aria-hidden />}>
                    Budget {usd(b)}
                  </Item>
                ))}
              </Group>

              <Group heading="Do">
                <Item value="imagine a change version" onSelect={run(onImagine)} icon={<Sparkles aria-hidden />} shortcut="I">
                  Imagine a change…
                </Item>
                <Item value="share link copy" onSelect={run(onShare)} icon={<Share2 aria-hidden />}>
                  Copy a link to this view
                </Item>
                <Item value="offer landlord ask list broker email memo" onSelect={run(onOffer)} icon={<Link2 aria-hidden />}>
                  Prepare the offer
                </Item>
                <Item value="broker owner density view" onSelect={run(onDensity)} icon={<Eye aria-hidden />}>
                  {broker ? "Owner view (plain words)" : "Broker view (every line)"}
                </Item>
              </Group>

              {sites.length ? (
                <Group heading="Other sites">
                  {sites.map((s) => (
                    <Item key={s.id} value={`site ${s.address} ${s.city}`} onSelect={run(() => onSite(s.id))} icon={<Building2 aria-hidden />}>
                      {s.address} <span className="text-ink-2">· {s.city}</span>
                    </Item>
                  ))}
                </Group>
              ) : null}
            </Command.List>
          </Command>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Word matching, not letter-scatter fuzzy: "cafe" finds "Make it cafe", not "refresh". */
function match(value: string, search: string): number {
  const v = value.toLowerCase();
  const q = search.toLowerCase().trim();
  if (!q) return 1;
  if (v.includes(q)) return 1;
  const words = q.split(/\s+/);
  const hits = words.filter((w) => v.includes(w)).length;
  return hits === words.length ? 0.8 : hits > 0 && words.length > 1 ? 0.3 * (hits / words.length) : 0;
}

function Group({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Command.Group heading={heading} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[0.6875rem] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-[0.06em] [&_[cmdk-group-heading]]:text-ink-2 [&_[cmdk-group-heading]]:uppercase">
      {children}
    </Command.Group>
  );
}

function Item({ value, onSelect, icon, shortcut, children }: { value: string; onSelect: () => void; icon: ReactNode; shortcut?: string; children: ReactNode }) {
  return (
    <Command.Item value={value} onSelect={onSelect} className={cn("flex min-h-11 cursor-default items-center gap-2.5 rounded-sm px-2 text-sm select-none data-[selected=true]:bg-ink data-[selected=true]:text-on-ink data-[selected=true]:[&_.text-ink-2]:text-on-ink-2 sm:min-h-9 [&_svg]:size-4 [&_svg]:shrink-0")}>
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut ? <kbd className="shrink-0 rounded-[2px] border border-current/30 px-1 font-mono text-[0.6875rem] opacity-70">{shortcut}</kbd> : null}
    </Command.Item>
  );
}
