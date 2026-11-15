import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSite, loadSites } from "@/lib/sites/load";

const minimal = {
  id: "1",
  address: "1 Main St",
  city: "Houston",
  state: "TX",
  postcode: "77002",
  lat: 29.7,
  lng: -95.3,
  propertyType: "GeneralRetail",
  buildingSf: 10000,
  yearBuilt: 1990,
  space: {
    spaceId: 1,
    listingId: 2,
    suite: "100",
    floor: "FirstFloor",
    sf: 2000,
    rentPerSfYr: 30,
    serviceType: "NNN",
    spaceUse: "Retail",
    spaceType: "Relet",
    notes: null,
    availableOn: "2026-01-01",
  },
  matterport: null,
  aerial: null,
};

function dirWith(files: Record<string, unknown>) {
  const dir = mkdtempSync(join(tmpdir(), "fg-sites-"));
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), typeof body === "string" ? body : JSON.stringify(body));
  }
  return dir;
}

describe("site loader", () => {
  it("loads every site in the folder with defaults applied", () => {
    const dir = dirWith({ "1.json": minimal, "2.json": { ...minimal, id: "2" } });
    const sites = loadSites(dir);
    expect(sites.map((s) => s.id).sort()).toEqual(["1", "2"]);
    expect(sites[0].findings).toEqual([]);
    expect(sites[0].space.restaurantKeywords).toEqual([]);
  });

  it("loads one site by id", () => {
    const dir = dirWith({ "1.json": minimal });
    expect(loadSite("1", dir)?.address).toBe("1 Main St");
    expect(loadSite("missing", dir)).toBeNull();
  });

  it("names the file and field when a site is invalid", () => {
    const dir = dirWith({ "bad.json": { ...minimal, city: "Dallas" } });
    expect(() => loadSites(dir)).toThrow(/bad\.json.*city/s);
  });

  it("rejects ids that could escape the folder", () => {
    const dir = dirWith({ "1.json": minimal });
    expect(loadSite("../1", dir)).toBeNull();
  });

  it("loads the committed demo sites", () => {
    const sites = loadSites();
    expect(sites.length).toBeGreaterThanOrEqual(2);
    expect(sites.map((s) => s.id)).toContain("1018657");
  });
});
