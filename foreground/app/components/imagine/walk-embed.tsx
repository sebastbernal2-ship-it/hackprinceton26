"use client";

import { useState } from "react";

const BASE = process.env.NEXT_PUBLIC_WALKTHROUGH_URL ?? "http://127.0.0.1:5173/";
const SCENE = process.env.NEXT_PUBLIC_WALKTHROUGH_SCENE ?? "demo";

/** Walkthrough viewer (the walkthrough/ Vite app) with this listing's finding pins. The viewer fetches findings itself, so the API must allow its origin (CORS). */
export default function WalkEmbed({ listingId }: { listingId: number }) {
  const [src, setSrc] = useState<string | null>(null);
  function load() {
    const findings = `${window.location.origin}/api/property/${listingId}/inspection`;
    setSrc(`${BASE}?scene=${encodeURIComponent(SCENE)}&findings=${encodeURIComponent(findings)}`);
  }
  return (
    <div>
      <h3 className="text-sm font-medium">Walk view with finding pins</h3>
      <p className="mt-1 text-xs text-foreground/50">
        Pins are candidate findings from the model, not confirmed defects.{SCENE === "demo" ? " The scene is the viewer's built-in DEMO room, not this property's scan." : ""} Start the viewer with <code>npm run dev</code> in walkthrough/.
      </p>
      {!src ? (
        <button type="button" onClick={load} className="mt-3 rounded-full border border-foreground/20 px-4 py-2 text-sm hover:bg-foreground/5">Open walk view</button>
      ) : (
        <>
          <iframe title="Walkthrough viewer" src={src} className="mt-3 aspect-[16/10] w-full rounded-xl border border-foreground/15" allow="fullscreen; xr-spatial-tracking" />
          <a href={src} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs underline">Open in a new tab</a>
        </>
      )}
    </div>
  );
}
