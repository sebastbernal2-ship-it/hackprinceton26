"use client";

import { setupSdk, type MpSdk } from "@matterport/sdk";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  applyStructure,
  buildLayout,
  buildLayoutFromScan,
  type FloorLayout,
  type MeasuredRoom,
  type StructureEdit,
} from "../lib/floor-layout";
import type { RoomAnchor, StagedPiece } from "../lib/tour-scene";
import ForegroundTour from "./foreground-tour";
import TourChat from "./tour-chat";
import TourModels from "./tour-models";

type TourMode = "matterport" | "foreground";

type TourOverlayProps = {
  tourId: string;
  title: string;
  detail?: string;
  squareFeet: number;
  openChat?: boolean;
  onClose: () => void;
};

export default function TourOverlay({ tourId, title, detail, squareFeet, openChat = false, onClose }: TourOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [sdk, setSdk] = useState<MpSdk | null>(null);
  const [chatOpen, setChatOpen] = useState(openChat);
  const [pieces, setPieces] = useState<StagedPiece[]>([]);
  const [anchors, setAnchors] = useState<RoomAnchor[]>([]);
  const [mode, setMode] = useState<TourMode>("matterport");
  const [layout, setLayout] = useState<FloorLayout>(() => buildLayout(squareFeet));
  const [planError, setPlanError] = useState<string | null>(null);

  function editStructure(edit: StructureEdit) {
    setLayout((current) => applyStructure(current, edit));
  }

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
    const sdkKey = process.env.NEXT_PUBLIC_MATTERPORT_SDK_KEY;
    if (!host) return;

    let cancelled = false;
    let connected: MpSdk | null = null;

    async function openTour() {
      if (!sdkKey) {
        setStatus("error");
        setError("Matterport SDK key is missing. Add NEXT_PUBLIC_MATTERPORT_SDK_KEY to foreground/.env.local.");
        return;
      }

      setStatus("loading");
      setError(null);
      setSdk(null);
      setPieces([]);
      setMode("matterport");
      setLayout(buildLayout(squareFeet));
      setPlanError(null);
      host!.replaceChildren();

      try {
        // play=1 skips the title card; qs=0 keeps the dollhouse fly-in instead of jumping inside.
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
            qs: 0,
            dh: 1,
            brand: 0,
            title: 0,
          },
        });
        if (cancelled) return;

        await connected.App.state.waitUntil((state) => state.phase === connected!.App.Phase.PLAYING);
        if (cancelled) return;

        // Land in dollhouse (aerial) so the user can rotate the exterior, then click in to go inside.
        await connected.Mode.moveTo(connected.Mode.Mode.DOLLHOUSE, {
          transition: connected.Camera.TransitionType.FLY,
        });
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
  }, [tourId, squareFeet]);

  useEffect(() => {
    if (!sdk) return;
    const scan = { rooms: [] as MeasuredRoom[], sweeps: [] as { x: number; z: number }[] };
    const publish = () => {
      const next = buildLayoutFromScan(scan.rooms, scan.sweeps);
      if (next.source !== "scan") return;
      setLayout((current) => {
        if (current.source === "plan") return current;
        if (current.measuredKey === next.measuredKey && current.source === "scan") return current;
        return current.freezerRemoved ? applyStructure(next, { kind: "remove-freezer" }) : next;
      });
    };
    const subscription = sdk.Room.data.subscribe({
      onCollectionUpdated(collection) {
        scan.rooms = Object.values(collection).map((entry) => ({
          id: entry.id,
          label: entry.label || "Room",
          min: { x: entry.bounds.min.x, z: entry.bounds.min.z },
          max: { x: entry.bounds.max.x, z: entry.bounds.max.z },
          floor: entry.floorInfo?.sequence ?? 0,
        }));
        setAnchors(
          scan.rooms.map((entry) => ({
            label: entry.label,
            position: {
              x: (entry.min.x + entry.max.x) / 2,
              y: 0,
              z: (entry.min.z + entry.max.z) / 2,
            },
          })),
        );
        publish();
      },
    });
    const sweeps = sdk.Sweep.data.subscribe({
      onCollectionUpdated(collection) {
        scan.sweeps = Object.values(collection).map((entry) => ({ x: entry.position.x, z: entry.position.z }));
        publish();
      },
    });
    return () => {
      subscription.cancel();
      sweeps.cancel();
    };
  }, [sdk]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/layout-analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ modelId: tourId, squareFeet }),
          signal: controller.signal,
        });
        const data = (await response.json()) as { layout?: FloorLayout | null; error?: string };
        if (!response.ok || !data.layout || data.layout.source !== "plan") {
          if (!controller.signal.aborted) setPlanError(data.error || "The floorplan could not be traced.");
          return;
        }
        setPlanError(null);
        setLayout((current) => {
          if (current.measuredKey === data.layout!.measuredKey && current.source === "plan") return current;
          return current.freezerRemoved ? applyStructure(data.layout!, { kind: "remove-freezer" }) : data.layout!;
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setPlanError(error instanceof Error ? error.message : "The floorplan could not be traced.");
      }
    })();
    return () => controller.abort();
  }, [tourId, squareFeet]);

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
            {mode === "foreground"
              ? "Foreground tour — walk through it, and the layout agent can move the walls"
              : status !== "ready"
                ? "Opening tour…"
                : chatOpen
                  ? "Layout agent is live — edits appear in the tour"
                  : "Aerial view — click into the model to go inside"}
          </p>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 bg-foreground">
        <div className={`absolute inset-0 ${mode === "foreground" ? "z-10" : "invisible pointer-events-none"}`}>
          {layout.source !== "pending" ? (
            <ForegroundTour title={title} detail={detail} squareFeet={squareFeet} layout={layout} pieces={pieces} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-[#141413] px-8 text-center text-background/70">
              <p className="max-w-md text-sm">{planError ?? "Reading the floorplan…"}</p>
            </div>
          )}
        </div>
        <div ref={containerRef} className={`absolute inset-0 ${mode === "matterport" ? "" : "invisible pointer-events-none"}`} />
        {mode === "matterport" && <TourModels sdk={sdk} pieces={pieces} />}
        <TourModeSwitch mode={mode} onChange={setMode} />

        {(status === "ready" || mode === "foreground") && (
          <TourChat
            sdk={sdk}
            open={chatOpen}
            onOpenChange={setChatOpen}
            pieces={pieces}
            onPiecesChange={setPieces}
            mode={mode}
            freezerRemoved={layout.freezerRemoved}
            hasFreezer={layout.rooms.some((entry) => entry.kind === "freezer")}
            rooms={layout.rooms}
            anchors={anchors}
            onStructure={editStructure}
          />
        )}

        {status === "loading" && mode === "matterport" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-foreground/40">
            <span className="inline-block h-2.5 w-2.5 animate-breathe rounded-full bg-background/70" />
          </div>
        )}

        {status === "error" && mode === "matterport" && (
          <div className="absolute inset-0 flex items-center justify-center bg-foreground px-8 text-center">
            <div className="max-w-md">
              <p className="text-lg font-medium">Tour unavailable</p>
              <p className="mt-3 text-sm text-background/60">{error}</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-8 rounded-full bg-background px-5 py-2.5 text-sm font-medium text-foreground"
              >
                Back to Discover
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TourModeSwitch({ mode, onChange }: { mode: TourMode; onChange: (mode: TourMode) => void }) {
  return (
    <div className="absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center rounded-full bg-[#ece7dd] p-1 shadow-[0_10px_30px_rgb(0_0_0/0.28)]">
      <ModeButton
        selected={mode === "matterport"}
        onClick={() => onChange("matterport")}
        icon={<CubeIcon />}
        label="Matterport Tour"
      />
      <ModeButton
        selected={mode === "foreground"}
        onClick={() => onChange("foreground")}
        icon={<PlayIcon />}
        label="Foreground Tour"
      />
    </div>
  );
}

function ModeButton({
  selected,
  onClick,
  icon,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium tracking-tight transition-colors ${
        selected ? "bg-background text-foreground shadow-[0_1px_2px_rgb(27_26_23/0.12)]" : "text-foreground/70 hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function CubeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M12 3.5 19 7.5v9L12 20.5 5 16.5v-9L12 3.5Z" strokeLinejoin="round" />
      <path d="M12 12.2 19 7.7M12 12.2 5 7.7M12 12.2v8.3" strokeLinejoin="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M8 6.5v11l9-5.5-9-5.5Z" />
    </svg>
  );
}
