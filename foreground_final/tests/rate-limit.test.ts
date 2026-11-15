import { beforeEach, describe, expect, it } from "vitest";
import { clientKey, guard, hit, reserveDaily, resetLimits, tooLarge } from "@/lib/rate-limit";

const req = (headers: Record<string, string> = {}) => new Request("http://x/api", { method: "POST", headers });

describe("rate limit", () => {
  beforeEach(() => resetLimits());

  it("allows up to the limit per minute, then asks to wait", () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(hit("b", "ip", { perMinute: 3 }, t + i)).toBe(0);
    expect(hit("b", "ip", { perMinute: 3 }, t + 10)).toBeGreaterThan(0);
    expect(hit("b", "other", { perMinute: 3 }, t + 10)).toBe(0);
    expect(hit("b", "ip", { perMinute: 3 }, t + 61_000)).toBe(0);
  });

  it("caps a daily budget and resets the next day", () => {
    const d1 = new Date("2026-11-14T10:00:00Z");
    expect(reserveDaily("img", 4, 6, d1)).toBe(true);
    expect(reserveDaily("img", 4, 6, d1)).toBe(false);
    expect(reserveDaily("img", 2, 6, d1)).toBe(true);
    expect(reserveDaily("img", 4, 6, new Date("2026-11-15T01:00:00Z"))).toBe(true);
  });

  it("rejects oversized bodies before parsing", () => {
    expect(tooLarge(req({ "content-length": "2000" }), 1000)?.status).toBe(413);
    expect(tooLarge(req({ "content-length": "500" }), 1000)).toBeNull();
  });

  it("keys clients by forwarded IP and returns 429 with Retry-After", () => {
    expect(clientKey(req({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    let last: Response | null = null;
    for (let i = 0; i < 5; i++) last = guard(req({ "x-forwarded-for": "9.9.9.9" }), "agent", 100_000);
    expect(last?.status).toBe(429);
    expect(last?.headers.get("Retry-After")).toBeTruthy();
  });
});
