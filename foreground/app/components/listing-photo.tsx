"use client";

import { useState } from "react";

/** A listing photo, or a clean illustrated placeholder (storefront line drawing) when none is on file or it fails to load. */
export default function ListingPhoto({ src, alt, className = "" }: { src: string | null | undefined; alt: string; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) {
    return (
      <div role="img" aria-label="No photo on file" className={`flex flex-col items-center justify-center gap-2 bg-foreground/5 text-xs text-foreground/45 ${className}`}>
        <svg viewBox="0 0 64 48" width="72" height="54" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 20h52l-4-12H10z" />
          <path d="M6 20c0 3 3 5 6.5 5S19 23 19 20c0 3 3 5 6.5 5S32 23 32 20c0 3 3 5 6.5 5S45 23 45 20c0 3 3 5 6.5 5S58 23 58 20" />
          <path d="M10 25v17h44V25" />
          <path d="M26 42V32h12v10" />
          <path d="M14 30h8v6h-8zM42 30h8v6h-8z" />
        </svg>
        No photo on file
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} referrerPolicy="no-referrer" onError={() => setFailed(src)} className={`object-cover ${className}`} />;
}
