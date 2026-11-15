"use client";

import { useState } from "react";

/** A listing photo, or an honest placeholder when none is on file or it fails to load. */
export default function ListingPhoto({ src, alt, className = "" }: { src: string | null | undefined; alt: string; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) {
    return (
      <div role="img" aria-label="No photo on file" className={`flex items-center justify-center bg-foreground/5 text-sm text-foreground/45 ${className}`}>
        No photo on file
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} referrerPolicy="no-referrer" onError={() => setFailed(src)} className={`object-cover ${className}`} />;
}
