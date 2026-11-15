import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Site } from "./schema";

export const SITES_DIR = join(process.cwd(), "data", "sites");
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

function parseFile(dir: string, file: string): Site {
  const raw = JSON.parse(readFileSync(join(dir, file), "utf8"));
  const result = Site.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid site file ${file}: ${issues}`);
  }
  return result.data;
}

export function loadSites(dir: string = SITES_DIR): Site[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => parseFile(dir, f));
}

export function loadSite(id: string, dir: string = SITES_DIR): Site | null {
  if (!SAFE_ID.test(id)) return null;
  const file = `${id}.json`;
  if (!existsSync(join(dir, file))) return null;
  return parseFile(dir, file);
}
