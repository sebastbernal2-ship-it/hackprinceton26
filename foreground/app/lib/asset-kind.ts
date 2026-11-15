import type { Asset } from "./assets";

export type AssetKind =
  | "espresso" | "grinder" | "brewer" | "display" | "oven" | "range" | "fryer" | "hood" | "sink" | "fridge" | "freezer" | "dish" | "mixer"
  | "dispenser" | "table-round" | "table" | "chair" | "stool" | "booth" | "counter" | "rack" | "shelf" | "host" | "register" | "plant"
  | "lamp" | "sign" | "trash" | "ice" | "blender" | "generic"
  | "walk-in" | "salamander" | "prep-table" | "undercounter" | "counter-sink" | "griddle" | "warmer" | "steamer" | "slicer" | "cart" | "drain" | "panel" | "fan" | "worktable";

// First match wins, so the specific words come before the general ones.
const RULES: [RegExp, AssetKind][] = [
  [/menu|\bscreens?\b|signage|sign\b/, "sign"], [/touchscreen|register|\bpos\b/, "register"],
  // Kitchen and counter pieces: specific words first so "counter with sink" or "range with oven" keep their own icon.
  [/walk-in/, "walk-in"], [/salamander|cheese melter/, "salamander"], [/counter with sink|hand-wash counter|sink cutout/, "counter-sink"], [/counter with/, "counter"],
  [/\bpass\b|pick-?up|expo/, "counter"], [/work table|butcher|marble table/, "worktable"], [/prep table/, "prep-table"],
  [/undercounter (refrigerator|freezer|fridge)|worktop|drawer refrigerator|wine and beverage/, "undercounter"], [/dish ?wash|dish machine|glasswasher/, "dish"],
  [/\brange\b|burner|cooktop/, "range"], [/griddle|charbroiler/, "griddle"], [/combi|steamer|immersion/, "steamer"],
  [/bain-marie|soup warmer|holding cabinet|steam table|warmer|rice cooker/, "warmer"], [/slicer|food processor/, "slicer"], [/\bcart\b|dish rack/, "cart"],
  [/floor drain|grease interceptor/, "drain"], [/fire suppression/, "panel"], [/makeup air/, "fan"],
  [/grinder/, "grinder"], [/espresso|coffee machine|group/, "espresso"], [/brewer|airpot|pour.?over|cold brew|kegerator|tap/, "brewer"],
  [/display|pastry|bakery case|dipping|merchandiser/, "display"], [/hood/, "hood"], [/pizza|oven|proofer|toaster|panini|microwave|waffle|crepe|holding cabinet/, "oven"],
  [/fryer/, "fryer"], [/range|griddle|charbroiler|burner|cooktop|flat.?top/, "range"], [/sink|wash/, "sink"], [/dish/, "dish"],
  [/freezer|batch freezer|frozen/, "freezer"], [/fridge|refrigerator|cooler|reach-in|undercounter/, "fridge"], [/mixer/, "mixer"],
  [/\bice\b/, "ice"], [/blender|smoothie|milkshake|spindle/, "blender"], [/dispenser|lassi|beverage|condiment|topping/, "dispenser"],
  [/round|pedestal|bistro/, "table-round"], [/booth|banquette|bench/, "booth"], [/bar stool|counter stool|stool/, "stool"], [/chair|armchair|lounge/, "chair"],
  [/host|hostess|stand/, "host"], [/register|pos\b/, "register"], [/plant|planter/, "plant"], [/lamp|pendant|light/, "lamp"], [/sign|menu board/, "sign"],
  [/trash|waste|recycl/, "trash"], [/rack|speed/, "rack"], [/shelf|shelving|pot rack/, "shelf"], [/counter|bar run|island|work table|prep/, "counter"], [/table/, "table"],
];

/** Picks a simple icon kind from the asset name, then its category. Never throws; unknown things get a plain box. */
export function assetKind(asset: Pick<Asset, "name" | "category">): AssetKind {
  const n = asset.name.toLowerCase();
  for (const [re, kind] of RULES) if (re.test(n)) return kind;
  const c = asset.category;
  if (c === "seating") return "chair";
  if (c === "table") return "table";
  if (c === "counter" || c === "prep_table") return "counter";
  if (c === "sink") return "sink";
  if (c === "oven") return "oven";
  if (c === "range") return "range";
  if (c === "hood") return "hood";
  if (c === "fridge") return "fridge";
  if (c === "freezer_display") return "freezer";
  if (c === "storage") return "rack";
  if (c === "dish") return "dish";
  return "generic";
}
