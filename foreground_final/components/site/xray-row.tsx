"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { linkProps, requestWalk, useFocusedFinding } from "./focus-store";

/** A cost row that lights up its block in the vessel, its callout in the lens and its pin in the tour. */
export function XRayRow({ focusKey, index, className, children }: { focusKey: string; index: number; className?: string; children: ReactNode }) {
  const active = useFocusedFinding() === focusKey;
  return (
    <tr
      {...linkProps(focusKey)}
      data-active={active}
      className={cn("rise-on-load transition-colors duration-200 data-[active=true]:bg-paper-2", className)}
      style={{ ["--i" as string]: index }}
    >
      {children}
    </tr>
  );
}

/** Takes the 3D walk to where this finding was seen (the workspace switches to Walk). */
export function SeeInScan({ findingId }: { findingId: string; panoId?: string }) {
  return (
    <button
      type="button"
      onClick={() => requestWalk(findingId)}
      {...linkProps(findingId)}
      className="min-h-6 text-xs font-medium text-ink underline decoration-rule-strong underline-offset-2 transition-[text-decoration-color] duration-200 hover:decoration-ink"
    >
      See it in the scan
    </button>
  );
}
