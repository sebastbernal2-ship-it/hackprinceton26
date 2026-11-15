import { createHash } from "node:crypto";

/** Server only (node:crypto). Keys for imagined panos: the same change on the same pano is generated once. */

export const normalizeInstruction = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase().replace(/[.!?]+$/, "");

const hash = (s: string, n: number): string => createHash("sha256").update(s).digest("hex").slice(0, n);

/**
 * One version per (site, instruction, base): every pano imagined with that change lands in the same version folder,
 * public/imagine/<siteId>/<versionId>/<panoId>/. Matches the version id pattern v[a-z0-9]{6,16}.
 */
export const imagineVersionId = (siteId: string, instruction: string, base: "empty" | "scanned" = "empty"): string =>
  `v${hash(`${siteId}|${base}|${normalizeInstruction(instruction)}`, 12)}`;

/** Cache key for one imagined pano. */
export const panoCacheKey = (siteId: string, panoId: string, instruction: string, base: "empty" | "scanned" = "empty"): string =>
  `${siteId}:${panoId}:${hash(`${base}|${normalizeInstruction(instruction)}`, 16)}`;
