import type { Asset } from "./assets";

export type AssetKind =
  | "espresso" | "grinder" | "brewer" | "display" | "oven" | "range" | "fryer" | "hood" | "sink" | "fridge" | "freezer" | "dish" | "mixer"
  | "dispenser" | "table-round" | "table" | "chair" | "stool" | "booth" | "counter" | "rack" | "shelf" | "host" | "register" | "plant"
  | "lamp" | "sign" | "trash" | "ice" | "blender" | "generic";

// First match wins, so the specific words come before the general ones.
const RULES: [RegExp, AssetKind][] = [
  [/menu|screens?\b|signage|sign\b/, "sign"], [/touchscreen|register|\bpos\b/, "register"],
  [/grinder/, "grinder"], [/espresso|coffee machine|group/, "espresso"], [/brewer|airpot|pour.?over|cold brew|kegerator|tap/, "brewer"],
  [/display|pastry|bakery case|gelato dipping|merchandiser/, "display"], [/hood/, "hood"], [/pizza|oven|proofer|toaster|panini|microwave|holding cabinet/, "oven"],
  [/fryer/, "fryer"], [/range|griddle|charbroiler|burner|cooktop|flat.?top/, "range"], [/sink|wash/, "sink"], [/dish/, "dish"],
  [/freezer|batch freezer|frozen/, "freezer"], [/fridge|refrigerator|cooler|reach-in|undercounter/, "fridge"], [/mixer/, "mixer"],
  [/ice/, "ice"], [/blender|smoothie|milkshake|spindle/, "blender"], [/dispenser|lassi|beverage|condiment|topping/, "dispenser"],
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
