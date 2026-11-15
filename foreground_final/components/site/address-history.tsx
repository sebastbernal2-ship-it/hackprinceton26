import type { Graveyard } from "@/lib/engine/types";
import type { Site } from "@/lib/sites/schema";
import { num } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Lifeline, type LifeCase } from "./lifeline";
import { Empty, Estimate, Fact, Src } from "./primitives";
import { Tween } from "./tween";

type Tenancy = Site["tenantHistory"][number];

type Future = { openMonths: number; startCash: number; cases: LifeCase[] };

export function AddressHistory({ tenants, graveyard, suite, future }: { tenants: Tenancy[]; graveyard: Graveyard; suite: string | null; future: Future }) {
  const food = tenants.filter((t) => t.isFood && t.moveIn).sort((a, b) => a.moveIn!.localeCompare(b.moveIn!));
  const others = tenants.length - tenants.filter((t) => t.isFood).length;
  // "closed" only when CoStar records it; every other departure is "left"
  const suiteClosed = tenants.filter((t) => t.isFood && t.sameSuite && t.outcome === "closed").length;

  const facts = (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
      <Fact label="Food tenants" value={<Tween value={graveyard.foodTenants} />} note={<Src>CoStar tenant records</Src>} />
      <Fact label="Gone from here" value={<Tween value={graveyard.closedHere} />} note={<Src>CoStar tenant records</Src>} />
      <Fact
        label={suite ? `Left suite ${suite}` : "Left this suite"}
        value={<Tween value={graveyard.sameSuiteFailures} className={suiteClosed > 0 ? "text-needed" : ""} />}
        note={
          <span className="flex flex-col gap-0.5">
            {graveyard.sameSuiteFailures > 0 ? (
              <span className={suiteClosed > 0 ? "font-semibold text-needed" : "text-ink-2"}>
                {suiteClosed > 0 ? `${num(suiteClosed)} closed` : "none recorded as closed"}
              </span>
            ) : null}
            <Src>CoStar tenant records</Src>
          </span>
        }
      />
      <Fact label="Median stay" value={graveyard.medianYears == null ? "—" : <><Tween value={graveyard.medianYears} kind="dec1" /> yr</>} note={<Estimate />} />
    </dl>
  );

  if (food.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        {facts}
        <Empty title="No food tenants on record at this address">
          CoStar has no past restaurants here{others > 0 ? `; ${others} other tenants are on file` : ""}. A first-generation food use means more build-out.
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <p className="lettering max-w-3xl text-2xl font-semibold leading-tight sm:text-[1.75rem]">{graveyard.summary}</p>
      {facts}
      <Lifeline
        tenants={food.map((t) => ({
          name: t.name,
          moveIn: t.moveIn!,
          moveOut: t.moveOut,
          years: t.years,
          suite: t.suite ?? null,
          sameSuite: t.sameSuite,
          current: t.current,
          outcome: t.outcome,
        }))}
        suite={suite}
        {...future}
      />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-ink-2">
        <Legend cls="bg-needed">Closed, this suite</Legend>
        <Legend cls="bg-maybe">Left this suite</Legend>
        <Legend cls="bg-ink-2">Elsewhere in the building</Legend>
        <Legend cls="bg-saved">Open now</Legend>
        <Src className="ml-auto">CoStar tenant history{others > 0 ? `; ${others} non-food tenants not shown` : ""}</Src>
      </div>
    </div>
  );
}

function Legend({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn("inline-block h-2.5 w-4 rounded-[1px]", cls)} />
      {children}
    </span>
  );
}
