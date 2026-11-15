import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

let loaded = false;

/** Server-only. Reads gitignored env files when Next has not loaded them. */
export function serverEnv(name: string): string | undefined {
  if (!loaded) {
    loaded = true;
    const files = [
      path.join(process.cwd(), ".env.local"),
      path.join(process.cwd(), ".env"),
      path.join(process.cwd(), "..", ".env"),
    ];
    for (const file of files) {
      if (!existsSync(file)) continue;
      for (const line of readFileSync(file, "utf8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        if (process.env[key]) continue;
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    }
  }
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}
