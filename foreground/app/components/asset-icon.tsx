import type { ReactNode } from "react";
import type { Asset } from "../lib/assets";
import { assetKind, type AssetKind } from "../lib/asset-kind";

const S = "stroke-foreground/55";
const BASE = `${S} fill-panel`;
const SOFT = `${S} fill-match-soft`;
const DARK = "fill-foreground/70";
const STEEL = `${S} fill-foreground/[0.08]`;

/** Little flat icons in a 48x48 box. Simple on purpose: they say what the piece is at a glance. */
const ICONS: Record<AssetKind, ReactNode> = {
  espresso: (<><rect x="6" y="14" width="36" height="22" rx="3" className={STEEL} /><rect x="10" y="9" width="28" height="6" rx="2" className={BASE} /><rect x="14" y="26" width="6" height="6" className={DARK} /><rect x="28" y="26" width="6" height="6" className={DARK} /><circle cx="24" cy="20" r="3" className={SOFT} /><rect x="9" y="36" width="30" height="4" rx="1" className={BASE} /></>),
  grinder: (<><path d="M16 8h16l-3 12H19z" className={SOFT} /><rect x="15" y="20" width="18" height="18" rx="3" className={STEEL} /><rect x="20" y="38" width="8" height="4" className={DARK} /></>),
  brewer: (<><rect x="8" y="12" width="24" height="26" rx="3" className={STEEL} /><rect x="12" y="16" width="16" height="6" rx="1" className={BASE} /><rect x="14" y="30" width="12" height="8" rx="1" className={SOFT} /><rect x="34" y="22" width="8" height="16" rx="2" className={BASE} /></>),
  display: (<><rect x="6" y="14" width="36" height="22" rx="2" className={SOFT} /><rect x="9" y="17" width="30" height="16" rx="1" className="fill-panel stroke-foreground/30" /><circle cx="16" cy="28" r="3" className={DARK} /><circle cx="25" cy="28" r="3" className={DARK} /><circle cx="34" cy="28" r="3" className={DARK} /><rect x="6" y="36" width="36" height="4" className={BASE} /></>),
  oven: (<><rect x="6" y="8" width="36" height="32" rx="3" className={STEEL} /><rect x="11" y="18" width="26" height="16" rx="2" className="fill-panel stroke-foreground/40" /><circle cx="14" cy="13" r="1.8" className={DARK} /><circle cx="22" cy="13" r="1.8" className={DARK} /><circle cx="30" cy="13" r="1.8" className={DARK} /></>),
  range: (<><rect x="6" y="8" width="36" height="32" rx="3" className={STEEL} /><circle cx="16" cy="18" r="5" className={BASE} /><circle cx="32" cy="18" r="5" className={BASE} /><circle cx="16" cy="32" r="5" className={BASE} /><circle cx="32" cy="32" r="5" className={BASE} /></>),
  fryer: (<><rect x="8" y="10" width="32" height="28" rx="3" className={STEEL} /><rect x="12" y="14" width="10" height="14" rx="1" className={SOFT} /><rect x="26" y="14" width="10" height="14" rx="1" className={SOFT} /><rect x="14" y="32" width="20" height="3" className={DARK} /></>),
  hood: (<><path d="M8 34l8-20h16l8 20z" className={STEEL} /><rect x="6" y="34" width="36" height="5" rx="1" className={BASE} /><line x1="16" y1="22" x2="32" y2="22" className="stroke-foreground/40" /></>),
  sink: (<><rect x="6" y="10" width="36" height="28" rx="3" className={STEEL} /><rect x="10" y="16" width="12" height="16" rx="2" className={SOFT} /><rect x="26" y="16" width="12" height="16" rx="2" className={SOFT} /><circle cx="24" cy="13" r="2" className={DARK} /></>),
  fridge: (<><rect x="10" y="6" width="28" height="36" rx="3" className={STEEL} /><line x1="10" y1="22" x2="38" y2="22" className="stroke-foreground/40" /><rect x="31" y="12" width="2" height="6" className={DARK} /><rect x="31" y="27" width="2" height="8" className={DARK} /></>),
  freezer: (<><rect x="6" y="14" width="36" height="24" rx="3" className={STEEL} /><path d="M24 18v16M17 21l14 10M31 21L17 31" className="stroke-match" fill="none" /></>),
  dish: (<><rect x="6" y="12" width="36" height="26" rx="3" className={STEEL} /><rect x="10" y="16" width="14" height="18" rx="1" className={SOFT} /><circle cx="33" cy="25" r="5" className={BASE} /><circle cx="33" cy="25" r="2" className={DARK} /></>),
  mixer: (<><rect x="14" y="30" width="20" height="10" rx="2" className={STEEL} /><path d="M18 30V18a6 6 0 0 1 12 0v12" className={BASE} /><rect x="20" y="8" width="14" height="6" rx="2" className={DARK} /></>),
  dispenser: (<><rect x="12" y="6" width="24" height="30" rx="3" className={SOFT} /><rect x="16" y="12" width="16" height="12" rx="1" className="fill-panel stroke-foreground/30" /><rect x="20" y="30" width="8" height="4" className={DARK} /><rect x="10" y="36" width="28" height="4" rx="1" className={BASE} /></>),
  "table-round": (<><circle cx="24" cy="24" r="15" className={SOFT} /><circle cx="24" cy="24" r="4" className={BASE} /></>),
  table: (<><rect x="6" y="12" width="36" height="24" rx="3" className={SOFT} /><circle cx="24" cy="24" r="3" className={BASE} /></>),
  chair: (<><rect x="12" y="20" width="24" height="20" rx="4" className={SOFT} /><rect x="12" y="8" width="24" height="9" rx="3" className={BASE} /></>),
  stool: (<><circle cx="24" cy="24" r="12" className={SOFT} /><circle cx="24" cy="24" r="5" className={BASE} /></>),
  booth: (<><path d="M8 12h32v26H8z" className={BASE} /><rect x="8" y="12" width="32" height="9" rx="3" className={SOFT} /><rect x="8" y="30" width="32" height="8" rx="3" className={SOFT} /></>),
  counter: (<><rect x="4" y="16" width="40" height="16" rx="2" className={SOFT} /><rect x="4" y="30" width="40" height="3" className={BASE} /><circle cx="14" cy="24" r="2" className={BASE} /><circle cx="34" cy="24" r="2" className={BASE} /></>),
  rack: (<><rect x="8" y="6" width="32" height="36" rx="2" className={BASE} /><line x1="8" y1="15" x2="40" y2="15" className={S} /><line x1="8" y1="24" x2="40" y2="24" className={S} /><line x1="8" y1="33" x2="40" y2="33" className={S} /><rect x="12" y="8" width="8" height="5" className={SOFT} /><rect x="24" y="26" width="10" height="5" className={SOFT} /></>),
  shelf: (<><rect x="6" y="14" width="36" height="4" rx="1" className={BASE} /><rect x="6" y="28" width="36" height="4" rx="1" className={BASE} /><rect x="12" y="6" width="8" height="8" className={SOFT} /><rect x="26" y="20" width="10" height="8" className={SOFT} /></>),
  host: (<><path d="M12 38V16l12-8 12 8v22z" className={SOFT} /><rect x="18" y="20" width="12" height="8" rx="1" className={BASE} /></>),
  register: (<><rect x="8" y="22" width="32" height="16" rx="2" className={STEEL} /><rect x="14" y="8" width="20" height="13" rx="2" className={SOFT} /><rect x="14" y="27" width="20" height="6" className={BASE} /></>),
  plant: (<><path d="M16 36h16l-2 8H18z" className={BASE} /><path d="M24 36c-8-4-10-12-6-20 8 2 12 10 6 20zM24 36c8-4 10-10 8-16-6 0-10 6-8 16z" className={SOFT} /></>),
  lamp: (<><path d="M24 4v10" className={S} /><path d="M12 30a12 12 0 0 1 24 0z" className={SOFT} /><circle cx="24" cy="34" r="3" className="fill-foreground/30" /></>),
  sign: (<><rect x="6" y="10" width="36" height="22" rx="2" className={BASE} /><line x1="12" y1="18" x2="32" y2="18" className="stroke-foreground/40" /><line x1="12" y1="24" x2="26" y2="24" className="stroke-foreground/40" /><rect x="22" y="32" width="4" height="8" className={DARK} /></>),
  trash: (<><path d="M12 14h24l-2 26H14z" className={STEEL} /><rect x="10" y="10" width="28" height="5" rx="2" className={BASE} /></>),
  ice: (<><rect x="8" y="8" width="32" height="32" rx="3" className={STEEL} /><rect x="14" y="14" width="8" height="8" rx="2" className={SOFT} /><rect x="26" y="20" width="8" height="8" rx="2" className={SOFT} /><rect x="14" y="28" width="8" height="8" rx="2" className={SOFT} /></>),
  blender: (<><path d="M16 6h16l-3 22H19z" className={SOFT} /><rect x="14" y="28" width="20" height="12" rx="3" className={STEEL} /><rect x="18" y="4" width="12" height="4" rx="1" className={DARK} /></>),
  "walk-in": (<><rect x="5" y="6" width="38" height="34" rx="2" className={STEEL} /><rect x="16" y="12" width="16" height="28" rx="1" className="fill-panel stroke-foreground/40" /><rect x="29" y="24" width="2" height="6" className={DARK} /><path d="M10 14v8M7 18h6" className="stroke-match" fill="none" /></>),
  salamander: (<><rect x="6" y="10" width="36" height="14" rx="2" className={STEEL} /><line x1="11" y1="17" x2="37" y2="17" className="stroke-match" /><line x1="11" y1="21" x2="37" y2="21" className="stroke-match" /><rect x="10" y="30" width="28" height="3" rx="1" className={BASE} /><path d="M14 33v6M34 33v6" className={S} /></>),
  "prep-table": (<><rect x="4" y="14" width="40" height="11" rx="2" className={STEEL} /><rect x="7" y="17" width="9" height="5" className={SOFT} /><rect x="19" y="17" width="9" height="5" className={SOFT} /><rect x="31" y="17" width="9" height="5" className={SOFT} /><rect x="4" y="25" width="40" height="15" rx="2" className={BASE} /><line x1="24" y1="25" x2="24" y2="40" className={S} /></>),
  undercounter: (<><rect x="4" y="10" width="40" height="5" rx="1" className={BASE} /><rect x="6" y="15" width="36" height="25" rx="2" className={STEEL} /><line x1="24" y1="15" x2="24" y2="40" className={S} /><rect x="20" y="22" width="2" height="7" className={DARK} /><rect x="26" y="22" width="2" height="7" className={DARK} /></>),
  "counter-sink": (<><rect x="4" y="18" width="40" height="6" rx="1" className={BASE} /><rect x="6" y="24" width="36" height="16" rx="2" className={SOFT} /><rect x="16" y="19" width="16" height="4" rx="1" className="fill-foreground/25 stroke-foreground/40" /><path d="M24 18v-6h5" className={S} fill="none" /></>),
  griddle: (<><rect x="5" y="20" width="38" height="14" rx="2" className={STEEL} /><rect x="8" y="14" width="32" height="7" rx="1" className={SOFT} /><circle cx="14" cy="28" r="2" className={DARK} /><circle cx="24" cy="28" r="2" className={DARK} /><circle cx="34" cy="28" r="2" className={DARK} /></>),
  warmer: (<><rect x="6" y="26" width="36" height="12" rx="2" className={STEEL} /><rect x="9" y="22" width="30" height="5" rx="1" className={SOFT} /><path d="M16 18c-2-3 2-4 0-8M24 18c-2-3 2-4 0-8M32 18c-2-3 2-4 0-8" className="stroke-match" fill="none" /></>),
  steamer: (<><rect x="8" y="6" width="32" height="36" rx="3" className={STEEL} /><circle cx="24" cy="23" r="10" className="fill-panel stroke-foreground/40" /><path d="M19 23c2-3 4 3 6 0s3 3 5 0" className="stroke-match" fill="none" /><circle cx="14" cy="11" r="1.5" className={DARK} /><circle cx="34" cy="11" r="1.5" className={DARK} /></>),
  slicer: (<><circle cx="20" cy="22" r="12" className={SOFT} /><circle cx="20" cy="22" r="3" className={BASE} /><rect x="6" y="34" width="36" height="6" rx="2" className={STEEL} /><rect x="34" y="14" width="6" height="18" rx="2" className={BASE} /></>),
  cart: (<><rect x="8" y="12" width="32" height="3" rx="1" className={BASE} /><rect x="8" y="26" width="32" height="3" rx="1" className={BASE} /><path d="M10 12v26M38 12v26" className={S} /><circle cx="10" cy="41" r="2.5" className={DARK} /><circle cx="38" cy="41" r="2.5" className={DARK} /><rect x="14" y="6" width="8" height="6" className={SOFT} /></>),
  drain: (<><rect x="8" y="8" width="32" height="32" rx="3" className={STEEL} /><path d="M14 16h20M14 24h20M14 32h20" className={S} /><circle cx="24" cy="24" r="4" className={DARK} /></>),
  panel: (<><rect x="12" y="5" width="24" height="26" rx="2" className={STEEL} /><circle cx="19" cy="13" r="3" className="fill-match-soft stroke-match" /><circle cx="29" cy="13" r="3" className={BASE} /><rect x="17" y="21" width="14" height="5" className={BASE} /><rect x="19" y="31" width="10" height="11" rx="3" className={SOFT} /></>),
  fan: (<><rect x="6" y="6" width="36" height="36" rx="4" className={STEEL} /><circle cx="24" cy="24" r="12" className="fill-panel stroke-foreground/40" /><path d="M24 24c0-7 6-9 8-5-1 4-4 5-8 5zM24 24c7 0 9 6 5 8-4-1-5-4-5-8zM24 24c0 7-6 9-8 5 1-4 4-5 8-5zM24 24c-7 0-9-6-5-8 4 1 5 4 5 8z" className={SOFT} /></>),
  worktable: (<><rect x="4" y="14" width="40" height="5" rx="1" className={BASE} /><path d="M8 19v21M40 19v21" className={S} /><rect x="8" y="32" width="32" height="3" rx="1" className={SOFT} /><rect x="4" y="8" width="40" height="3" rx="1" className={STEEL} /></>),
  generic: (<><rect x="8" y="12" width="32" height="24" rx="4" className={SOFT} /><line x1="8" y1="32" x2="40" y2="32" className={S} /></>),
};

/** A small flat icon for a catalog piece. Falls back to a plain box for anything unrecognised. */
export default function AssetIcon({ asset, size = 44, className = "" }: { asset: Pick<Asset, "name" | "category">; size?: number; className?: string }) {
  const kind = assetKind(asset);
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} role="img" aria-label={`${kind.replace("-", " ")} icon`} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" className={className}>
      {ICONS[kind]}
    </svg>
  );
}
