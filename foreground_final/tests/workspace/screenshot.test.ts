import { describe, expect, it } from "vitest";
import { toJpegDataUrl } from "@/components/workspace/walk-view";

describe("toJpegDataUrl", () => {
  it("keeps a valid data URL", () => {
    expect(toJpegDataUrl("data:image/png;base64,QUJD")).toBe("data:image/png;base64,QUJD");
  });
  it("fixes image/jpg and line breaks", () => {
    expect(toJpegDataUrl("data:image/jpg;base64,QU\nJD")).toBe("data:image/jpeg;base64,QUJD");
  });
  it("adds the prefix to bare base64", () => {
    expect(toJpegDataUrl("QUJD")).toBe("data:image/jpeg;base64,QUJD");
  });
  it("rejects non-image data", () => {
    expect(toJpegDataUrl("data:text/html;base64,QUJD")).toBeNull();
    expect(toJpegDataUrl("not base64!")).toBeNull();
    expect(toJpegDataUrl(undefined)).toBeNull();
  });
});
