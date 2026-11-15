/** Client-safe contract for /api/imagine-pano. No Node imports. */

export const PANO_DISCLAIMER = "AI visualization, not a construction drawing";
export const MAX_FACE_EDITS = 6;

export type FaceIndex = 0 | 1 | 2 | 3 | 4 | 5;

export type PanoImagineErrorCode = "quota" | "busy" | "failed" | "blocked" | "no_key" | "bad_request";

export type PanoImagineEvent =
  /** faces: the edit order, grouped into stages that run one after another */
  | { type: "start"; versionId: string; panoId: string; base: "empty" | "scanned"; stages: FaceIndex[][]; cached: boolean }
  | { type: "face"; panoId: string; face: FaceIndex; url: string; ms: number }
  | { type: "face_error"; panoId: string; face: FaceIndex; code: PanoImagineErrorCode; message: string; ms: number }
  | { type: "done"; panoId: string; versionId: string; faces: Partial<Record<FaceIndex, string>>; ms: number; edits: number }
  | { type: "error"; code: PanoImagineErrorCode; message: string };

/** Imagined faces for one change, by pano. Faces absent for a pano fall back to its base (empty, else scanned). */
export type ImaginedVersion = {
  versionId: string;
  instruction: string;
  panos: Record<string, Partial<Record<FaceIndex, string>>>;
};
