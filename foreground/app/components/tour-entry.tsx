"use client";

import { useEffect, useState } from "react";
import PlanVision from "./plan-vision";
import TourOverlay from "./tour-overlay";

type Props = { tourId: string; title: string; detail?: string; onClose: () => void };

/** Opens the editable first-person walk (furniture can be placed) when this scan has a local export; else the read-only Matterport tour. */
export default function TourEntry(props: Props) {
  const [walk, setWalk] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/walk3d/available?model=${encodeURIComponent(props.tourId)}`)
      .then((r) => (r.ok ? r.json() : { walk: false }))
      .then((d: { walk?: boolean }) => live && setWalk(Boolean(d.walk)), () => live && setWalk(false));
    return () => { live = false; };
  }, [props.tourId]);
  if (walk === null) return null;
  return walk ? <PlanVision {...props} /> : <TourOverlay {...props} />;
}
