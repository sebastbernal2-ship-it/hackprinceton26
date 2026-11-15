"use client";

import { setupSdk, type MpSdk } from "@matterport/sdk";
import { useEffect, useId, useRef, useState } from "react";
import type { StagedPiece } from "../lib/tour-scene";
import TourChat, { TourGhosts } from "./tour-chat";

type TourOverlayProps = {
  tourId: string;
  title: string;
  detail?: string;
  openChat?: boolean;
  /** Layout agent and staged furniture. Off for the Inspect tour (a plain Matterport Showcase tour); for later planning steps. */
  editing?: boolean;
  onClose: () => void;
};

export default function TourOverlay({ tourId, title, detail, openChat = false, editing = false, onClose }: TourOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [sdk, setSdk] = useState<MpSdk | null>(null);
  const [chatOpen, setChatOpen] = useState(openChat);
  const [pieces, setPieces] = useState<StagedPiece[]>([]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (chatOpen) {
        setChatOpen(false);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, chatOpen]);

  useEffect(() => {
    const host = containerRef.current;
    const sdkKey = process.env.MATTERPORT_SDK_KEY;
    if (!host) return;

    let cancelled = false;
    let connected: MpSdk | null = null;

    async function openTour() {
      if (!sdkKey) {
        setStatus("error");
        setError("Matterport SDK key is missing. Set MATTERPORT_SDK_KEY in the repo-root .env (or your shell) and restart npm run dev.");
        return;
      }

      setStatus("loading");
      setError(null);
      setSdk(null);
      setPieces([]);
      host!.replaceChildren();

      try {
        // play=1 skips the title card; qs=1 opens straight inside at the start position (no dollhouse fly-in);
        // ts=-1 never auto-starts the guided tour, which would otherwise fly the camera around on its own.
        connected = await setupSdk(sdkKey, {
          space: tourId,
          container: host!,
          iframeAttributes: {
            class: "h-full w-full border-0",
            allow: "fullscreen; xr-spatial-tracking",
            allowfullscreen: "true",
          },
          iframeQueryParams: {
            play: 1,
            qs: 1,
            ts: -1,
            dh: 1,
            brand: 0,
            title: 0,
          },
        });
        if (cancelled) return;

        await connected.App.state.waitUntil((state) => state.phase === connected!.App.Phase.PLAYING);
        if (cancelled) return;

        // Stay in the walkable tour view (inside); dollhouse and floor plan remain one click away in Matterport's controls.
        const mode = await new Promise<string | null>((resolve) => {
          const sub = connected!.Mode.current.subscribe((m) => { resolve(m); queueMicrotask(() => sub.cancel()); });
        });
        if (mode !== connected.Mode.Mode.INSIDE) {
          await connected.Mode.moveTo(connected.Mode.Mode.INSIDE, { transition: connected.Camera.TransitionType.INSTANT });
        }
        if (cancelled) return;

        setSdk(connected);
        setStatus("ready");
      } catch (cause) {
        if (cancelled) return;
        console.error(cause);
        setStatus("error");
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not open the Matterport tour. The SDK key only works on allow-listed domains like localhost.",
        );
      }
    }

    void openTour();

    return () => {
      cancelled = true;
      host.replaceChildren();
      connected = null;
    };
  }, [tourId]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelId}
      className="fixed inset-0 z-50 flex flex-col bg-foreground text-background animate-rise"
    >
      <header className="flex shrink-0 items-center gap-4 px-4 py-3 md:px-6">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-background/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-background/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Close
        </button>
        <div className="min-w-0 flex-1 pr-14">
          <h2 id={labelId} className="truncate text-sm font-medium tracking-tight">
            {title}
            {detail ? ` · ${detail}` : ""}
          </h2>
          <p className="truncate text-xs text-background/55">
            {status === "ready"
              ? editing && chatOpen
                ? "Layout agent is live — edits appear in the tour"
                : "Matterport 3D tour · drag to look around, click the floor to move"
              : "Opening tour…"}
          </p>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 bg-foreground">
        <div ref={containerRef} className="absolute inset-0" />
        {editing && <TourGhosts pieces={pieces} sdk={sdk} onPiecesChange={setPieces} />}

        {editing && status === "ready" && (
          <TourChat
            tourId={tourId}
            sdk={sdk}
            open={chatOpen}
            onOpenChange={setChatOpen}
            pieces={pieces}
            onPiecesChange={setPieces}
          />
        )}

        {status === "loading" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-foreground/40">
            <span className="inline-block h-2.5 w-2.5 animate-breathe rounded-full bg-background/70" />
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center bg-foreground px-8 text-center">
            <div className="max-w-md">
              <p className="text-lg font-medium">Tour unavailable</p>
              <p className="mt-3 text-sm text-background/60">{error}</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-8 rounded-full bg-background px-5 py-2.5 text-sm font-medium text-foreground"
              >
                Back to Shortlist
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
