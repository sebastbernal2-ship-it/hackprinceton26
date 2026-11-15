import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import AssetIcon from "../../components/asset-icon";
import type { Asset } from "../assets";
import { assetKind } from "../asset-kind";

const k = (name: string, category = "other") => assetKind({ name, category } as never);

describe("assetKind", () => {
  it("recognises cafe equipment by name", () => {
    expect(k("Espresso machine, 2 group")).toBe("espresso");
    expect(k("Espresso grinder")).toBe("grinder");
    expect(k("Bakery/pastry display case, 48 in")).toBe("display");
    expect(k("Dining chair", "seating")).toBe("chair");
    expect(k("Bar stool", "seating")).toBe("stool");
    expect(k("Wall banquette, 90 in", "seating")).toBe("booth");
    expect(k("Communal table, 96x36 in", "table")).toBe("table");
  });
  it("does not mistake menu screens for display cases", () => {
    expect(k("Wall-mounted menu display screens (2)")).toBe("sign");
    expect(k("Stainless counter-top unit with touchscreen")).toBe("register");
  });
  it("falls back to the category, then a plain box", () => {
    expect(k("Something odd", "sink")).toBe("sink");
    expect(k("Mystery thing", "other")).toBe("generic");
  });

  it("gives kitchen and counter pieces their own icons", () => {
    expect(k("Walk-in cooler, 8x8 ft", "storage")).toBe("walk-in");
    expect(k("Walk-in freezer, 8x10 ft", "storage")).toBe("walk-in");
    expect(k("Type I hood 10 ft x 48 in", "hood")).toBe("hood");
    expect(k("Salamander broiler, 36 in", "oven")).toBe("salamander");
    expect(k("Sandwich prep table, 60 in", "fridge")).toBe("prep-table");
    expect(k("Undercounter refrigerator, 2 door 48 in", "fridge")).toBe("undercounter");
    expect(k("Worktop freezer, 60 in", "fridge")).toBe("undercounter");
    expect(k("Service counter with sink cutout, 72 in", "counter")).toBe("counter-sink");
    expect(k("Hand-wash counter, 36 in", "counter")).toBe("counter-sink");
    expect(k("Service counter with built-in cooler, 60 in", "counter")).toBe("counter");
    expect(k("Gas range, 6 burner with oven, 48 in", "range")).toBe("range");
    expect(k("Gas flat-top griddle, 48 in", "range")).toBe("griddle");
    expect(k("Combi oven, 10 pan electric", "oven")).toBe("steamer");
    expect(k("Dishwasher, door-type 20 in rack", "dish")).toBe("dish");
    expect(k("Floor drain, 6 in", "other")).toBe("drain");
    expect(k("Heat-lamp pass, 72 in", "counter")).toBe("counter");
    expect(k("Ice maker head, 30 in 500 lb", "other")).toBe("ice");
    expect(k("Ice cream dipping cabinet, 60 in", "freezer_display")).toBe("display");
  });
  it("no longer mistakes service for ice", () => expect(k("Service counter, 72 in", "counter")).toBe("counter"));

  const LIB = join(__dirname, "../../../../assets/library");
  const kitchen = readdirSync(LIB).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(LIB, f), "utf8")) as Asset)
    .filter((a) => a.provenance.origin.includes("class (nominal"));
  it("every new kitchen item resolves to a specific icon (never the plain box) and the set uses many distinct ones", () => {
    expect(kitchen.length).toBeGreaterThanOrEqual(60);
    for (const a of kitchen) expect(assetKind(a), a.name).not.toBe("generic");
    expect(new Set(kitchen.map((a) => assetKind(a))).size).toBeGreaterThanOrEqual(18);
  });
  it("renders a distinct labelled svg per new kind", () => {
    const names = ["Walk-in cooler", "Salamander broiler", "Sandwich prep table", "Undercounter refrigerator, 2 door", "Hand-wash counter", "Gas flat-top griddle", "Soup warmer",
      "Combi oven", "Meat slicer", "Utility cart", "Floor drain", "Fire suppression panel", "Makeup air unit", "Stainless work table", "Type I hood"];
    const svg = names.map((name) => renderToStaticMarkup(createElement(AssetIcon, { asset: { name, category: "other" } as never })));
    expect(new Set(names.map((name) => assetKind({ name, category: "other" } as never))).size).toBe(names.length);
    for (const m of svg) expect(m).toMatch(/<svg[^>]*role="img"/);
    expect(new Set(svg).size).toBe(svg.length);
  });
});
