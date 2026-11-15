"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ImaginedVersion } from "@/lib/immersive/imagine-types";
import { PanoViewer, type PanoSite, type PanoViewerHandle, type WalkMode } from "@/components/immersive/pano-viewer";
import type { PanoJob } from "@/components/immersive/use-imagine-pano";

/**
 * The Walk's Imagined mode: the 360 walk from components/immersive, standing where the Matterport camera was.
 * The scan is unmounted while this is up (one WebGL context at a time); the workspace owns the streaming
 * (useImaginePano) so the faces keep arriving whichever viewer is on screen. Opens on the scanned room and wipes
 * to the imagined one from the pointer, so the change is seen being made.
 */
export function ImaginedWalk({
  site,
  startPano,
  version,
  jobs,
  ensure,
  retry,
  onPano,
}: {
  site: PanoSite;
  startPano: string;
  version: ImaginedVersion | null;
  jobs: Record<string, PanoJob>;
  ensure: (panoId: string, lookFace: 1 | 2 | 3 | 4, background?: boolean) => void;
  retry: (panoId: string, lookFace: 1 | 2 | 3 | 4) => void;
  /** every pano the walk stands in, so the scan can pick up from there */
  onPano: (panoId: string) => void;
}) {
  const viewer = useRef<PanoViewerHandle>(null);
  const [mode, setMode] = useState<WalkMode>("scanned");
  const [panoId, setPanoId] = useState(startPano);
  const job = jobs[panoId];

  // the reveal: first frame as scanned, then the wipe to imagined
  useEffect(() => {
    const t = window.setTimeout(() => setMode("imagined"), 450);
    return () => window.clearTimeout(t);
  }, []);

  const onPanoChange = useCallback(
    (id: string) => {
      setPanoId(id);
      onPano(id);
    },
    [onPano],
  );

  // walking in the imagined room: imagine the pano you arrive in (or join its prefetch)
  useEffect(() => {
    if (mode !== "imagined" || !version?.instruction) return;
    ensure(panoId, viewer.current?.lookFace() ?? 1);
  }, [mode, panoId, version?.instruction, ensure]);

  // when this pano is done, prefetch the one ahead
  const done = job?.state === "done";
  useEffect(() => {
    if (!done || mode !== "imagined") return;
    const ahead = viewer.current?.ahead();
    if (ahead) ensure(ahead, viewer.current?.lookFace() ?? 1, true);
  }, [done, mode, panoId, ensure]);

  let status: React.ReactNode = null;
  if (version?.instruction) {
    if (!job) status = "Getting this room ready…";
    else if (job.state === "error")
      status = (
        <span role="alert">
          {job.error?.message}{" "}
          <button type="button" className="underline" onClick={() => retry(panoId, viewer.current?.lookFace() ?? 1)}>
            Try again
          </button>
        </span>
      );
    else if (job.state === "running") status = `Imagining this room: ${job.faces} of ${job.total} walls${job.background ? " (started ahead of you)" : ""}…`;
    else status = `Imagined: “${version.instruction}”${job.cached ? " (saved)" : job.ms ? ` in ${(job.ms / 1000).toFixed(0)} s` : ""}`;
  }

  return (
    <PanoViewer ref={viewer} site={site} initialPanoId={startPano} mode={mode} imaginedVersion={version} onPanoChange={onPanoChange} className="absolute inset-0">
      {status ? (
        <p aria-live="polite" className="ws-float pointer-events-none absolute right-3 bottom-[8.5rem] max-w-[22rem] rounded-sm px-2 py-1 text-xs text-on-ink-2 [&_button]:pointer-events-auto">
          {status}
        </p>
      ) : null}
    </PanoViewer>
  );
}
