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
