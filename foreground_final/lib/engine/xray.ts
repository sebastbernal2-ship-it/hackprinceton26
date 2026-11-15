import type { Site, FindingKind } from "@/lib/sites/schema";
import { benchmarks, findingFor, range, scaleRange, spaceClass, type SpaceClass } from "./benchmarks";
import { fitSeats, operatedSeats } from "./seats";
import type { Concept, CostLine, OwnerBrief, Range, XRay } from "./types";

/**
 * Hidden-Cost X-Ray.
 *
 * Space class (see spaceClass) sets the base rate:
 *   former restaurant (prior-use or hood present, or a food tenant in this suite) -> second-generation refresh $/SF
 *   first-generation shell, or no sign of a past restaurant                       -> full shell $/SF
 *
 * System lines (hood, grease, walk-in, ADA restroom, electrical, gas, sewer) follow the site's findings:
 *   present -> "saved"  (existing infrastructure; not counted in the total, summed into `saved` as avoided cost)
 *   absent  -> "needed" (counted in full)
 *   unknown -> "maybe"  (counted at benchmarks.maybeShare, 50%)
 * With no finding at all:
 *   first-generation shell      -> needed (assume nothing is installed)
 *   former restaurant           -> maybe for hood, grease, walk-in and ADA restroom
 *   no restaurant history       -> maybe for everything except sewer
 * Services a space already ran on are left out unless a finding is clear (present or absent); an "unknown"
 * finding there is not counted: electrical, gas and sewer in a former restaurant, sewer in any occupied building.
 * A cafe or bar may not cook under a Type 1 hood, so a missing hood is "maybe" for them rather than "needed".
 *
 * FF&E = seats the owner will operate x a per-seat range (lower in a former restaurant, where kitchen fixtures
 * are largely in place). Permits are always needed.
 * Contingency = 30% of (needed + maybe share). Total = that subtotal + contingency.
 * overBudget compares the total midpoint to the owner's budget; null when no budget was given.
 */

const X = benchmarks.xray;
const MAYBE_SHARE = benchmarks.maybeShare.value;
const CONTINGENCY = benchmarks.contingency.value;
const LIGHT_COOKING: Concept[] = ["cafe", "bar"];
const POINT_OF_USE_GREASE: Concept[] = ["cafe", "quick-service"];

type Cost = { low: number; high: number; source: { label: string } };

type SystemRule = {
  id: string;
  label: string;
  kind: FindingKind;
  findingKinds: FindingKind[];
  cost: Cost;
  /** space classes where the line is left out unless a finding clearly says present or absent */
  omitUnchecked: SpaceClass[];
};

function systemRules(concept: Concept): SystemRule[] {
  const pointOfUse = POINT_OF_USE_GREASE.includes(concept);
  const utilities: SpaceClass[] = ["former-restaurant"];
  return [
    {
      id: "hood",
      label: "Kitchen hood and ventilation",
      kind: "hood",
      findingKinds: ["hood"],
      cost: X.hood,
      omitUnchecked: [],
    },
    {
      id: "grease-trap",
      label: pointOfUse ? "Grease trap (point-of-use)" : "Grease interceptor (in-ground)",
      kind: "grease-trap",
      findingKinds: ["grease-trap"],
      cost: pointOfUse ? X.greasePointOfUse : X.greaseInGround,
      omitUnchecked: [],
    },
    {
      id: "walk-in",
      label: "Walk-in cooler",
      kind: "walk-in",
      findingKinds: ["walk-in"],
      cost: X.walkIn,
      omitUnchecked: [],
    },
    {
      id: "ada-restroom",
      label: "ADA restroom",
      kind: "ada",
      findingKinds: ["ada", "restrooms"],
      cost: X.adaRestroom,
      omitUnchecked: [],
    },
    {
      id: "electrical",
      label: "Electrical service upgrade",
      kind: "electrical",
      findingKinds: ["electrical"],
      cost: X.electrical,
      omitUnchecked: utilities,
    },
    { id: "gas", label: "Gas line", kind: "gas", findingKinds: ["gas"], cost: X.gas, omitUnchecked: utilities },
    {
      id: "sewer",
      label: "Sewer connection",
      kind: "sewer",
      findingKinds: ["sewer"],
      cost: X.sewer,
      omitUnchecked: ["former-restaurant", "no-restaurant-history"],
    },
  ];
}

function systemLine(cls: SpaceClass, site: Site, concept: Concept, rule: SystemRule): CostLine | null {
  const finding = findingFor(site, ...rule.findingKinds);
  const name = rule.label.toLowerCase();
  let status: CostLine["status"];
  let reason: string;

  if (finding?.status === "present") {
    status = "saved";
    reason = `Existing ${name} found, so this cost is avoided: ${finding.evidence}`;
  } else if (finding?.status === "absent") {
    status = "needed";
    reason = `No ${name} found: ${finding.evidence}`;
  } else if (rule.omitUnchecked.includes(cls)) {
    return null;
  } else if (finding) {
    status = "maybe";
    reason = `Could not confirm a ${name}: ${finding.evidence} Counted at ${MAYBE_SHARE * 100}% until checked.`;
  } else if (cls === "first-gen") {
    status = "needed";
    reason = "First-generation shell: assume none is installed.";
  } else {
    status = "maybe";
    reason = `Not checked yet. Counted at ${MAYBE_SHARE * 100}% until confirmed on a walk-through.`;
  }

  if (rule.id === "hood" && status === "needed" && LIGHT_COOKING.includes(concept)) {
    status = "maybe";
    reason = `${reason} A ${concept} may not need a Type 1 hood; counted at ${MAYBE_SHARE * 100}%.`;
  }

  return {
    id: rule.id,
    label: rule.label,
    kind: rule.kind,
    status,
    range: range(rule.cost.low, rule.cost.high),
    reason,
    source: rule.cost.source.label,
    ...(finding ? { findingId: finding.id } : {}),
  };
}

function sum(lines: CostLine[], status: CostLine["status"]): Range {
  const picked = lines.filter((l) => l.status === status);
  return {
    low: picked.reduce((t, l) => t + l.range.low, 0),
    mid: picked.reduce((t, l) => t + l.range.mid, 0),
    high: picked.reduce((t, l) => t + l.range.high, 0),
  };
}

function add(a: Range, b: Range): Range {
  return { low: a.low + b.low, mid: a.mid + b.mid, high: a.high + b.high };
}

const SPACE_WORDS: Record<SpaceClass, string> = {
  "former-restaurant": "a former restaurant that needs a refresh, not a rebuild",
  "first-gen": "a first-generation shell",
  "no-restaurant-history": "a space with no sign of a past restaurant, priced like a shell",
};

export function xray(site: Site, brief: OwnerBrief): XRay {
  const cls = spaceClass(site);
  const secondGen = cls === "former-restaurant";
  const rate = secondGen ? X.baseBuildoutPerSf.secondGen : X.baseBuildoutPerSf.shell;
  const perSeat = secondGen ? X.ffePerSeat.secondGen : X.ffePerSeat.shell;
  const sf = site.space.sf;
  const seats = operatedSeats(fitSeats(site, brief.concept), brief);

  const lines: CostLine[] = [
    {
      id: "base-buildout",
      label: secondGen ? "Base build-out (second-generation refresh)" : "Base build-out (shell)",
      kind: "base-buildout",
      status: "needed",
      range: range(sf * rate.low, sf * rate.high),
      reason: `${sf.toLocaleString("en-US")} SF at $${rate.low}-${rate.high}/SF for ${
        SPACE_WORDS[cls]
      }; kitchen systems are priced separately below.`,
      source: rate.source.label,
    },
    ...systemRules(brief.concept)
      .map((rule) => systemLine(cls, site, brief.concept, rule))
      .filter((l): l is CostLine => l !== null),
    {
      id: "ffe",
      label: "Furniture, fixtures and equipment",
      kind: "ffe",
      status: "needed",
      range: range(seats * perSeat.low, seats * perSeat.high),
      reason: `${seats} seats at $${perSeat.low.toLocaleString("en-US")}-${perSeat.high.toLocaleString("en-US")} a seat${
        secondGen ? "; kitchen fixtures are largely in place" : ", including full kitchen equipment"
      }.`,
      source: perSeat.source.label,
    },
    {
      id: "permits",
      label: "Permits and fees",
      kind: "permits",
      status: "needed",
      range: range(X.permits.low, X.permits.high),
      reason: "Building, health and fire permits; varies by city and scope.",
      source: X.permits.source.label,
    },
  ];

  const subtotal = add(sum(lines, "needed"), scaleRange(sum(lines, "maybe"), MAYBE_SHARE));
  const contingency = scaleRange(subtotal, CONTINGENCY);
  const saved = sum(lines, "saved");

  lines.push({
    id: "contingency",
    label: `Contingency (${CONTINGENCY * 100}%)`,
    kind: "contingency",
    status: "needed",
    range: contingency,
    reason: `Build-outs run over; plan for costs ${CONTINGENCY * 100}% above the subtotal.`,
    source: benchmarks.contingency.source.label,
  });

  const total = add(subtotal, contingency);
  const overBudget = brief.budgetUsd === undefined ? null : total.mid > brief.budgetUsd;
  return { lines, total, saved, overBudget };
}
