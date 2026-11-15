import { describe, expect, it } from "vitest";
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
});
