"use client";

import PlanVision from "./plan-vision";

type Props = { tourId: string; title: string; detail?: string; onClose: () => void };

/** Opens the editable first-person walk when this scan has a local export; otherwise PlanVision shows Matterport's public read-only embed (no SDK key needed). */
export default function TourEntry(props: Props) {
  return <PlanVision {...props} />;
}
