import { readFileSync } from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// Keys live once, under their standard names, in the repo-root .env (shared with the Python scripts):
//   MATTERPORT_API_KEY, MATTERPORT_API_TOKEN  server only (Model API: scan photos, floor plans, meshes)
//   MATTERPORT_SDK_KEY                         the Showcase SDK key, which the browser needs to open a tour
// Only these names are taken from the root .env, so its other settings (API_URL, ports) cannot override the app's
// own foreground/.env.local. Shell variables and foreground/.env.local still win. Never hard-code a key.
loadEnvConfig(process.cwd());
const ROOT_KEYS = ["MATTERPORT_API_KEY", "MATTERPORT_API_TOKEN", "MATTERPORT_SDK_KEY"];
try {
  for (const line of readFileSync(path.resolve(process.cwd(), "..", ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && ROOT_KEYS.includes(m[1]) && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
} catch {
  // no root .env: keys come from the shell or foreground/.env.local
}

// Python API (services/api). Server-side only; the browser always calls same-origin /api/*.
const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  // Hide the Next.js dev-mode "N" badge (dev only; build errors still show).
  devIndicators: false,
  // Only the SDK key is exposed to the browser bundle; the API key and token stay server-side.
  env: {
    MATTERPORT_SDK_KEY: process.env.MATTERPORT_SDK_KEY || process.env.NEXT_PUBLIC_MATTERPORT_SDK_KEY || "",
  },
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  async rewrites() {
    return [
      // walk.html (served at /walk3d/) loads scan exports from root-absolute /assets_<id>/ and /pano_<id>/ paths.
      { source: "/:dir(assets_[A-Za-z0-9]+|pano_[A-Za-z0-9]+)/:path*", destination: "/walk3d/files/:dir/:path*" },
      { source: "/api/:path*", destination: `${API_URL}/api/:path*` },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
