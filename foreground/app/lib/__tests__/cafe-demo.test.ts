import { describe, expect, it } from "vitest";
import { CAFE_MATCHES, isCafePrompt } from "../cafe-demo";

describe("café demo prompt", () => {
  it("matches the shortcut spellings only", () => {
    for (const t of ["cafes", "Cafes", " cafés ", "cafe", "CAFES."]) expect(isCafePrompt(t)).toBe(true);
    for (const t of ["coffee", "cafes in houston", "a cafe", ""]) expect(isCafePrompt(t)).toBe(false);
  });

  it("shows three labelled demo spaces with no invented rent or size", () => {
    expect(CAFE_MATCHES.map((m) => m.tourId)).toEqual(["w2JcUVybv9c", "xVKH13z5MJ8", "JAnuRsaVo9M"]);
    for (const m of CAFE_MATCHES) {
      expect(m.demo).toBe(true);
      expect(m.rentPerSquareFootYear).toBeNull();
      expect(m.squareFeet).toBe(0);
    }
    expect(new Set(CAFE_MATCHES.map((m) => m.listingId)).size).toBe(3);
  });
});
