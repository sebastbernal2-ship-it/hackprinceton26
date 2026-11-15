import { join, normalize, sep } from "node:path";

/** Server only. Files written under public/imagine at runtime are not served by `next start`, so /media/imagine/... serves them. */

export const MEDIA_ROOT = join(process.cwd(), "public", "imagine");
export const MEDIA_PREFIX = "/media/imagine";

export const MEDIA_TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,79}$/;

/** The file under `root` for URL path segments, with its content type; null for anything that is not a plain image path. */
export function resolveMediaPath(segments: string[], root: string = MEDIA_ROOT): { file: string; type: string } | null {
  if (!segments.length || segments.length > 6) return null;
  for (const s of segments) {
    let seg = s;
    try {
      seg = decodeURIComponent(s);
    } catch {
      return null;
    }
    if (seg !== s || !SEGMENT.test(seg) || seg.includes("..")) return null;
  }
  const ext = segments[segments.length - 1].split(".").pop()?.toLowerCase() ?? "";
  const type = MEDIA_TYPES[ext];
  if (!type || !segments[segments.length - 1].includes(".")) return null;
  const file = normalize(join(root, ...segments));
  if (!file.startsWith(normalize(root) + sep)) return null;
  return { file, type };
}
