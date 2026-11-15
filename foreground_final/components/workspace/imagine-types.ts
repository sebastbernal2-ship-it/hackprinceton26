import type { OwnerBrief } from "@/lib/engine/types";
import type { Layout, Op } from "@/lib/layout";
import type { Site } from "@/lib/sites/schema";

/** The contract the Imagine panel (components/imagine/imagine-panel.tsx, owned by another agent) is mounted with. */
export type ImaginePanelProps = {
  site: Site;
  brief: OwnerBrief;
  /** the plan as the owner last left it in the Plan view */
  layout?: Layout;
  /** apply layout changes the imagined version needs; the workspace switches to Plan and runs them */
  onLayoutOps?: (ops: Op[]) => void;
  /** a picture of the Walk view as it is now (a data URL), or null when the Walk is not running */
  getScreenshot?: () => Promise<string | null>;
};

/**
 * Three-year survival odds for one site, as the workspace shows them. lib/ml/survival.ts (another agent) is adapted
 * into this shape on the server; until it exists the sheet shows a labelled placeholder.
 */
export type SurvivalOdds = {
  /** probability (0..1) the business is still open after three years */
  probability: number;
  /** optional band around it */
  low?: number;
  high?: number;
  factors: { label: string; direction: "up" | "down"; detail?: string }[];
  source: string;
  /** calibration-aware text to print instead of the raw probability, e.g. "about 3 in 4" */
  displayText?: string;
  /** against the typical food tenancy (about 69%) */
  relativeBand?: "above typical" | "typical" | "below typical";
  baseline?: number;
  /** one line to show wherever a prediction is shown */
  disclosure?: string;
};
