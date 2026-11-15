import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // langsmith (pulled in by deepagents) does an optional import("ws"); bundling it fails the build
  // because ws is not installed. Loaded from node_modules at runtime, the import fails softly as intended.
  serverExternalPackages: ["langsmith"],
  images: {
    // CoStar listing photos and floor plans
    remotePatterns: [new URL("https://ahprd1cdn.csgpimgs.com/**")],
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
