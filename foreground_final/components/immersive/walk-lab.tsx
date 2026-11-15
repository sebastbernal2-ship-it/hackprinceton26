"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Site } from "@/lib/sites/schema";
import { cn } from "@/lib/utils";
import { PanoViewer, type PanoViewerHandle, type WalkMode } from "./pano-viewer";
import { useImaginePano } from "./use-imagine-pano";

const EXAMPLES = ["add a long wooden bar with stools along the windows", "paint the walls deep green with brass wall lights", "polished concrete floor and white oak banquettes"];

/** Standalone walk with a mode switch and an "Imagine a change" dock: /lab/walk?site=<id> */
export function WalkLab({ site }: { site: Pick<Site, "id" | "address" | "city" | "matterport"> }) {
  const viewer = useRef<PanoViewerHandle>(null);
  const [mode, setMode] = useState<WalkMode>("scanned");
  const [panoId, setPanoId] = useState<string | null>(null);
  const [hasEmpty, setHasEmpty] = useState(true);
  const [text, setText] = useState("");
  const { version, jobs, start, ensure, retry } = useImaginePano(site.id);
  const job = panoId ? jobs[panoId] : undefined;
  const hasImagined = !!version;

  const onPanoChange = useCallback(
    (id: string, info: { hasEmpty: boolean }) => {
      setPanoId(id);
      setHasEmpty(info.hasEmpty);
      if (!info.hasEmpty) setMode((m) => (m === "empty" ? "scanned" : m));
    },
    [],
  );

  // walking in the imagined room: imagine the pano you arrive in (or join its prefetch)
  useEffect(() => {
    if (mode !== "imagined" || !panoId || !hasImagined) return;
    ensure(panoId, viewer.current?.lookFace() ?? 1);
  }, [mode, panoId, hasImagined, ensure]);

  // when this pano is done, prefetch the one ahead in the background
  const done = job?.state === "done";
  useEffect(() => {
    if (!done || mode !== "imagined") return;
    const ahead = viewer.current?.ahead();
    if (ahead) ensure(ahead, viewer.current?.lookFace() ?? 1, true);
  }, [done, mode, panoId, ensure]);

  const submit = () => {
    const t = text.trim();
    if (t.length < 3 || !panoId) return;
    start(t, panoId, viewer.current?.lookFace() ?? 1);
    setMode("imagined");
  };

  return (
    <PanoViewer ref={viewer} site={site} mode={mode} imaginedVersion={version} onPanoChange={onPanoChange} className="h-dvh w-full">
      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
        <p className="pointer-events-auto max-w-[60%] rounded-sm bg-ink/75 px-2 py-1 text-[0.8125rem] text-on-ink-2 backdrop-blur-sm">
          <span className="lettering-wide mr-2 font-bold text-on-ink">Foreground</span>
          {site.address}, {site.city}
        </p>
      </header>

      <div role="radiogroup" aria-label="What the room shows" className="absolute top-12 left-1/2 flex -translate-x-1/2 rounded-sm bg-ink/80 p-0.5 backdrop-blur-sm">
        {(
          [
            ["scanned", "Scanned", true],
            ["empty", "Empty", hasEmpty],
            ["imagined", "Imagined", hasImagined],
          ] as const
        ).map(([m, label, enabled]) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            disabled={!enabled}
            onClick={() => setMode(m)}
            className={cn(
              "h-8 min-w-20 rounded-sm px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              mode === m ? "bg-on-ink text-ink" : "text-on-ink-2 hover:text-on-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <form
        className="absolute bottom-3 left-1/2 w-[min(40rem,calc(100%-14rem))] max-sm:bottom-[11.5rem] max-sm:w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-sm bg-ink/85 p-2 backdrop-blur-sm"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex gap-2">
          <label htmlFor="walk-imagine" className="sr-only">
            Imagine a change
          </label>
          <input
            id="walk-imagine"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Imagine a change…"
            maxLength={500}
            className="h-9 min-w-0 flex-1 rounded-sm bg-paper px-2 text-ink placeholder:text-ink-2"
          />
          <button type="submit" disabled={text.trim().length < 3 || job?.state === "running"} className="h-9 rounded-sm bg-on-ink px-3 text-sm font-medium text-ink disabled:opacity-50">
            Imagine
          </button>
        </div>
        {!version && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => setText(ex)} className="rounded-sm border border-on-ink-2/30 px-2 py-0.5 text-[0.75rem] text-on-ink-2 hover:text-on-ink">
                {ex}
              </button>
            ))}
          </div>
        )}
        <Status job={job} onRetry={() => panoId && retry(panoId, viewer.current?.lookFace() ?? 1)} instruction={version?.instruction} />
      </form>
    </PanoViewer>
  );
}

function Status({ job, onRetry, instruction }: { job?: ReturnType<typeof useImaginePano>["jobs"][string]; onRetry: () => void; instruction?: string }) {
  if (!instruction) return null;
  let body: React.ReactNode;
  if (!job) body = "This spot is not imagined yet.";
  else if (job.state === "error")
    body = (
      <span role="alert" className="text-needed-wash">
        {job.error?.message}{" "}
        <button type="button" onClick={onRetry} className="underline">
          Try again
        </button>
      </span>
    );
  else if (job.state === "running") body = `Imagining this room: ${job.faces} of ${job.total} walls${job.background ? " (started ahead of you)" : ""}…`;
  else body = `Imagined: “${instruction}”${job.cached ? " (saved)" : job.ms ? ` in ${(job.ms / 1000).toFixed(0)} s` : ""}.`;
  return (
    <p aria-live="polite" className="mt-1.5 px-0.5 text-[0.75rem] text-on-ink-2">
      {body}
    </p>
  );
}
