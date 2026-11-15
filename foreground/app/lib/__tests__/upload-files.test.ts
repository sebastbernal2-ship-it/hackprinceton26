import { describe, expect, it } from "vitest";
import { checkUploadFiles, isVideoFile, MAX_ASSET_UPLOAD_VIDEO_BYTES } from "../assets";

const f = (name: string, size = 10) => ({ name, size });

describe("checkUploadFiles", () => {
  it("accepts up to 6 images or exactly one video", () => {
    expect(checkUploadFiles([f("a.jpg"), f("b.PNG")])).toBeNull();
    expect(checkUploadFiles([f("clip.mov", MAX_ASSET_UPLOAD_VIDEO_BYTES)])).toBeNull();
    expect(isVideoFile(f("x.WEBM"))).toBe(true);
  });
  it("rejects empty, mixed, many videos, wrong types and oversize", () => {
    expect(checkUploadFiles([])?.status).toBe(422);
    expect(checkUploadFiles([f("a.mp4"), f("b.jpg")])?.status).toBe(422);
    expect(checkUploadFiles([f("a.mp4"), f("b.mp4")])?.status).toBe(422);
    expect(checkUploadFiles(Array.from({ length: 7 }, (_, i) => f(`${i}.jpg`)))?.status).toBe(422);
    expect(checkUploadFiles([f("a.gif")])?.status).toBe(415);
    expect(checkUploadFiles([f("a.jpg", 6 * 1024 * 1024)])?.status).toBe(413);
    expect(checkUploadFiles([f("a.mp4", MAX_ASSET_UPLOAD_VIDEO_BYTES + 1)])?.status).toBe(413);
  });
});
