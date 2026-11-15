export type DefectCategory =
  | "plumbing" | "electrical" | "hvac" | "flooring" | "ceiling_water_damage" | "walls_finishes"
  | "structural" | "kitchen_infrastructure" | "egress_accessibility" | "layout_inefficiency" | "other";
export type Severity = "low" | "medium" | "high" | "unknown";

export type DefectFinding = {
  id: string;
  roomId: string | null;
  category: DefectCategory;
  title: string;
  description: string;
  severity: Severity;
  /** The model's own stated confidence, 0-1. Not a probability. */
  modelConfidence: number;
  evidence: { source: "panorama" | "floorplan_geometry" | "listing_text"; ref: string; region: { x: number; y: number; w: number; h: number } | null };
  canConfirmFromImagery: boolean;
  verificationStep: string;
  costLineItemIds: string[];
  /** Present on rule-based findings: "derived" = rule over an observed fact, "estimated" = DEMO ESTIMATE. */
  status?: "derived" | "estimated";
  confidenceLabel?: "low" | "medium" | "high";
};

export type InspectionMode = "live" | "fixture" | "demo" | "none";
export type InspectionResponse = { findings: DefectFinding[]; mode: InspectionMode; notice: string };

export const CATEGORY_LABEL: Record<DefectCategory, string> = {
  plumbing: "Plumbing", electrical: "Electrical", hvac: "HVAC", flooring: "Flooring",
  ceiling_water_damage: "Ceiling / water damage", walls_finishes: "Walls & finishes", structural: "Structural",
  kitchen_infrastructure: "Kitchen infrastructure", egress_accessibility: "Egress & accessibility",
  layout_inefficiency: "Layout inefficiency", other: "Other",
};

export const MODE_BANNER: Record<InspectionMode, string> = {
  live: "",
  fixture: "Sample findings, not from this property",
  demo: "Demo estimates, not observed",
  none: "No inspection run",
};

export async function fetchInspection(listingId: number): Promise<InspectionResponse> {
  const response = await fetch(`/api/property/${listingId}/inspection`);
  if (!response.ok) throw new Error(`inspection ${response.status}`);
  return (await response.json()) as InspectionResponse;
}

export function groupByCategory(findings: DefectFinding[]): [DefectCategory, DefectFinding[]][] {
  const groups = new Map<DefectCategory, DefectFinding[]>();
  for (const finding of findings) groups.set(finding.category, [...(groups.get(finding.category) ?? []), finding]);
  return [...groups.entries()];
}
