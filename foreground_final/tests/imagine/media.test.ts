import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMediaPath } from "@/lib/imagine/media";

const root = join(process.cwd(), "public", "imagine");

describe("resolveMediaPath", () => {
  it("accepts site/version/pano images with the right content type", () => {
    const hit = resolveMediaPath(["1018657", "vabc123def456", "p1", "face-1.jpg"], root);
    expect(hit?.type).toBe("image/jpeg");
    expect(hit?.file.startsWith(root + sep)).toBe(true);
    expect(resolveMediaPath(["1018657", "v1abc23-1.png"], root)?.type).toBe("image/png");
    expect(resolveMediaPath(["a", "b.webp"], root)?.type).toBe("image/webp");
    expect(resolveMediaPath(["a", "b.JPEG"], root)?.type).toBe("image/jpeg");
  });
  it("rejects traversal in every spelling", () => {
    for (const p of [["..", "x.png"], ["a", "..", "b.png"], ["a", "%2e%2e", "b.png"], ["a", "..%2fb.png"], ["a", "b..png"], ["a\..\b.png"], ["a/b.png"], [".env.png"]]) {
      expect(resolveMediaPath(p, root)).toBeNull();
    }
  });
  it("rejects other file types, no extension, empty and absurdly deep paths", () => {
    for (const p of [["a", "b.svg"], ["a", "b.html"], ["a", "b.json"], ["a", "b"], ["a", "png"], [], ["a", "a", "a", "a", "a", "a", "b.png"]]) {
      expect(resolveMediaPath(p, root)).toBeNull();
    }
  });
});
