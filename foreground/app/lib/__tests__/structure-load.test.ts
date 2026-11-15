import { afterEach, expect, it, vi } from "vitest";
import { loadStructure } from "../structure";

afterEach(() => vi.unstubAllGlobals());

it("a missing snapshot (503) costs one request and resolves to unknown, shared by remounts", async () => {
  const f = vi.fn(async () => new Response(JSON.stringify({ detail: "snapshot unavailable" }), { status: 503 }));
  vi.stubGlobal("fetch", f);
  const [a, b] = await Promise.all([loadStructure(9001), loadStructure(9001)]);
  expect(a).toEqual({ s: null, c: null });
  expect(b).toBe(a);
  expect(f).toHaveBeenCalledTimes(1);
});

it("requests scenarios only after the structure answered", async () => {
  const f = vi.fn(async (u: string) => new Response(JSON.stringify({ listingId: 9002, u }), { status: 200 }));
  vi.stubGlobal("fetch", f);
  const r = await loadStructure(9002);
  expect(r.s).not.toBeNull();
  expect(f.mock.calls.map((c) => c[0])).toEqual(["/api/structure/9002", "/api/structure/9002/scenarios"]);
});

it("a failed load is not cached forever: reopening the property retries once the API is back", async () => {
  let up = false;
  const f = vi.fn(async () => (up ? new Response(JSON.stringify({ listingId: 9003 }), { status: 200 }) : new Response("{}", { status: 503 })));
  vi.stubGlobal("fetch", f);
  const first = await loadStructure(9003);
  expect(first).toEqual({ s: null, c: null });
  up = true;
  const second = await loadStructure(9003);
  expect(second.s).not.toBeNull();
});

it("concurrent callers still share one in-flight request", async () => {
  const f = vi.fn(async () => new Response(JSON.stringify({ listingId: 9004 }), { status: 200 }));
  vi.stubGlobal("fetch", f);
  const [a, b] = await Promise.all([loadStructure(9004), loadStructure(9004)]);
  expect(b).toBe(a);
  expect(f).toHaveBeenCalledTimes(2); // structure + scenarios, once for both callers
});
