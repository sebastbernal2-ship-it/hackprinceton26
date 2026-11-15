// The DefectFinding contract (../contracts/defect-finding.schema.json) as the viewer reads it, plus an
// optional anchor in room metres (floor at y = 0) and an optional surfaceStatus. Pure logic, no DOM.
//
// Wording rules (same as the rest of the product): a finding is a candidate for an on-site inspector to
// verify, never a confirmed defect; modelConfidence is the model's own stated number, not a probability;
// missing from an image is not absent on site; findings may only sit on captured surfaces.

export type Severity = 'low' | 'medium' | 'high' | 'unknown';
export type EvidenceSource = 'panorama' | 'floorplan_geometry' | 'listing_text';
export type SurfaceStatus = 'captured' | 'inferred';

export const CATEGORIES = [
  'plumbing', 'electrical', 'hvac', 'flooring', 'ceiling_water_damage', 'walls_finishes', 'structural',
  'kitchen_infrastructure', 'egress_accessibility', 'layout_inefficiency', 'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Anchor { x: number; y: number; z: number }

export interface DefectFinding {
  id: string;
  roomId: string | null;
  category: Category;
  title: string;
  description: string;
  severity: Severity;
  /** The model's own stated confidence (0..1). NOT a calibrated probability. */
  modelConfidence: number;
  evidence: { source: EvidenceSource; ref: string; region: { x: number; y: number; w: number; h: number } | null };
  canConfirmFromImagery: boolean;
  verificationStep: string;
  costLineItemIds: string[];
  /** Where the pin goes, room metres, floor at y = 0. Without it the finding is listed but not pinned. */
  anchor?: Anchor;
  /** Set by the producer when it knows the anchored surface was inferred (not captured). */
  surfaceStatus?: SurfaceStatus;
}

export interface Rejected { index: number; id: string | null; reason: string }
export interface ParsedFindings { findings: DefectFinding[]; rejected: Rejected[]; label: string | null }

const SEVERITIES: readonly string[] = ['low', 'medium', 'high', 'unknown'];
const SOURCES: readonly string[] = ['panorama', 'floorplan_geometry', 'listing_text'];
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown): v is string => typeof v === 'string';

function parseRegion(v: unknown): DefectFinding['evidence']['region'] | undefined {
  if (v === null) return null;
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  return finite(r.x) && finite(r.y) && finite(r.w) && finite(r.h) ? { x: r.x, y: r.y, w: r.w, h: r.h } : undefined;
}

/** One finding, or the reason it cannot be shown. Required fields follow the schema; nothing is invented. */
export function parseFinding(raw: unknown): DefectFinding | string {
  if (!raw || typeof raw !== 'object') return 'not an object';
  const r = raw as Record<string, unknown>;
  for (const k of ['id', 'title', 'description', 'verificationStep'] as const) {
    if (!str(r[k]) || (k !== 'description' && !r[k])) return `missing ${k}`;
  }
  if (!(r.roomId === null || str(r.roomId))) return 'roomId must be a string or null';
  const category: Category = (CATEGORIES as readonly string[]).includes(r.category as string) ? (r.category as Category) : 'other';
  if (!finite(r.modelConfidence) || r.modelConfidence < 0 || r.modelConfidence > 1) return 'modelConfidence must be a number in 0..1';
  const ev = r.evidence as Record<string, unknown> | undefined;
  if (!ev || typeof ev !== 'object' || !SOURCES.includes(ev.source as string) || !str(ev.ref)) return 'evidence needs source and ref';
  const region = parseRegion(ev.region);
  if (region === undefined) return 'evidence.region must be null or {x,y,w,h}';
  if (typeof r.canConfirmFromImagery !== 'boolean') return 'missing canConfirmFromImagery';
  if (!Array.isArray(r.costLineItemIds) || !r.costLineItemIds.every(str)) return 'costLineItemIds must be a list of strings';
  const severity = SEVERITIES.includes(r.severity as string) ? (r.severity as Severity) : null;
  if (!severity) return 'severity must be low, medium, high or unknown';
  const out: DefectFinding = {
    id: r.id as string,
    roomId: r.roomId as string | null,
    category,
    title: r.title as string,
    description: r.description as string,
    severity,
    modelConfidence: r.modelConfidence,
    evidence: { source: ev.source as EvidenceSource, ref: ev.ref, region },
    canConfirmFromImagery: r.canConfirmFromImagery,
    verificationStep: r.verificationStep as string,
    costLineItemIds: r.costLineItemIds as string[],
  };
  if (r.anchor !== undefined) {
    const a = r.anchor as Record<string, unknown> | null;
    if (!a || !finite(a.x) || !finite(a.y) || !finite(a.z) || Math.abs(a.x) > 1000 || Math.abs(a.y) > 1000 || Math.abs(a.z) > 1000) {
      return 'anchor must be {x,y,z} in room metres';
    }
    out.anchor = { x: a.x, y: a.y, z: a.z };
  }
  if (r.surfaceStatus !== undefined) {
    if (r.surfaceStatus !== 'captured' && r.surfaceStatus !== 'inferred') return 'surfaceStatus must be captured or inferred';
    out.surfaceStatus = r.surfaceStatus;
  }
  return out;
}

/** Accepts {findings:[...]} or a bare list. Invalid entries are reported, never silently repaired. Duplicate ids keep the first. */
export function parseFindings(raw: unknown): ParsedFindings {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && Array.isArray((raw as { findings?: unknown }).findings) ? (raw as { findings: unknown[] }).findings : null;
  const label = raw && typeof raw === 'object' && str((raw as { _label?: unknown })._label) ? (raw as { _label: string })._label : null;
  if (!list) return { findings: [], rejected: [{ index: -1, id: null, reason: 'expected {"findings":[...]} or a list' }], label };
  const findings: DefectFinding[] = [];
  const rejected: Rejected[] = [];
  const seen = new Set<string>();
  list.forEach((item, index) => {
    const res = parseFinding(item);
    const id = item && typeof item === 'object' && str((item as { id?: unknown }).id) ? (item as { id: string }).id : null;
    if (typeof res === 'string') return void rejected.push({ index, id, reason: res });
    if (seen.has(res.id)) return void rejected.push({ index, id: res.id, reason: 'duplicate id' });
    seen.add(res.id);
    findings.push(res);
  });
  return { findings, rejected, label };
}

/** Effective surface status: the producer's word, else what the viewer measured, else unknown. */
export function surfaceOf(f: DefectFinding, measured: SurfaceStatus | null): SurfaceStatus | 'unknown' {
  return f.surfaceStatus ?? measured ?? 'unknown';
}

export const SEVERITY_COLOR: Record<Severity, string> = { high: '#e5484d', medium: '#f5a524', low: '#3b82f6', unknown: '#8b93a1' };
export const SEVERITY_LABEL: Record<Severity, string> = { high: 'High', medium: 'Medium', low: 'Low', unknown: 'Severity unknown' };
export const SOURCE_LABEL: Record<EvidenceSource, string> = { panorama: 'Panorama image', floorplan_geometry: 'Floor-plan geometry', listing_text: 'Listing text' };
export const CATEGORY_LABEL = (c: Category): string => c.replace(/_/g, ' ');

export const WORDING = {
  candidate: 'Candidate finding from the model, not a confirmed defect.',
  confidence: "The model's own stated confidence, not a probability.",
  verify: 'An on-site inspector must verify',
  imagery: (can: boolean) => (can ? 'Imagery may be enough to confirm this.' : 'Cannot be confirmed from imagery alone.'),
  inferred: 'This spot was inferred, not captured. It is not evidence; do not act on it.',
  unknownSurface: 'Whether this spot was captured is not known.',
  floating: 'Anchor is not near any scanned surface: placement is unverified.',
  noAnchor: 'No 3D position given, so no pin is shown.',
  costs: 'Amounts come from the cost engine, not from this viewer.',
} as const;

export interface Described {
  title: string;
  badges: string[];
  /** Always shown first. */
  notice: string;
  /** Shown when the surface is not known to be captured (warning, not decoration). */
  warning: string | null;
  rows: { label: string; text: string }[];
}

/** The text of a finding card, shared by the page panel and the headset panel so the wording cannot drift. */
export function describeFinding(f: DefectFinding, surface: SurfaceStatus | 'unknown', floating: boolean): Described {
  const region = f.evidence.region;
  const regionText = region ? ` (image region x ${region.x}, y ${region.y}, w ${region.w}, h ${region.h}, normalised)` : '';
  const warning = surface === 'inferred' ? WORDING.inferred : surface === 'unknown' ? WORDING.unknownSurface : floating ? WORDING.floating : null;
  return {
    title: f.title,
    badges: [SEVERITY_LABEL[f.severity], CATEGORY_LABEL(f.category), surface === 'captured' ? 'captured surface' : surface === 'inferred' ? 'inferred surface' : 'surface not known'],
    notice: WORDING.candidate,
    warning,
    rows: [
      { label: 'What the model saw', text: f.description },
      { label: 'Model confidence', text: `${f.modelConfidence.toFixed(2)}. ${WORDING.confidence}` },
      { label: 'Evidence', text: `${SOURCE_LABEL[f.evidence.source]}: ${f.evidence.ref}${regionText}. ${WORDING.imagery(f.canConfirmFromImagery)}` },
      { label: `${WORDING.verify}`, text: f.verificationStep },
      { label: 'Linked cost lines', text: f.costLineItemIds.length ? `${f.costLineItemIds.join(', ')}. ${WORDING.costs}` : 'None linked.' },
    ],
  };
}
