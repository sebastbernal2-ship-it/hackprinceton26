"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { MpSdk } from "@matterport/sdk";
import { furnitureTone, tourAgentReply, type TourKind } from "../lib/tour-agent";
import { moveInTour, nudge, placeInTour, placeOnSurface, pointInFront, readPose, uprightStem, type StagedPiece } from "../lib/tour-scene";

type Message = { role: "agent" | "user"; text: string };

type TourChatProps = {
  sdk: MpSdk | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pieces: StagedPiece[];
  onPiecesChange: (next: StagedPiece[] | ((current: StagedPiece[]) => StagedPiece[])) => void;
};

const SUGGESTIONS = ["Add rug", "Move sofa left", "Warm lighting", "Minimal style"];

const SLOTS = [
  { x: 22, y: 58 },
  { x: 38, y: 66 },
  { x: 14, y: 72 },
  { x: 32, y: 48 },
  { x: 26, y: 78 },
];

export default function TourChat({ sdk, open, onOpenChange, pieces, onPiecesChange }: TourChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [value, setValue] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pieceSeq = useRef(0);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function stage(kind: TourKind, label: string) {
    const pieceId = `${kind}-${pieceSeq.current++}`;
    onPiecesChange((current) => {
      const slot = SLOTS[current.length % SLOTS.length];
      const piece: StagedPiece = {
        id: pieceId,
        kind,
        label,
        tagId: null,
        position: { x: slot.x / 10, y: 0.4, z: slot.y / 10 },
        stem: uprightStem(kind),
        screen: slot,
      };
      return [...current, piece];
    });
    if (!sdk) return;
    void (async () => {
      const pose = await readPose(sdk);
      const frame = document.querySelector("iframe");
      const surface = frame
        ? await placeOnSurface(sdk, { x: frame.clientWidth / 2, y: frame.clientHeight * 0.66 }, kind, pose.position)
        : null;
      const position = surface?.position ?? pointInFront(pose, kind === "wall" ? 2.8 : 2.1);
      const stem = surface?.stem ?? uprightStem(kind);
      const tagId = await placeInTour(sdk, { kind, label, position, stem });
      if (!tagId) return;
      onPiecesChange((current) => current.map((item) => (item.id === pieceId ? { ...item, tagId, position, stem } : item)));
    })();
  }

  function slide(direction: "left" | "right" | "forward" | "back", meters: number) {
    const current = pieces[pieces.length - 1];
    if (!current) return;
    const screen = {
      x: Math.min(48, Math.max(10, current.screen.x + (direction === "left" ? -8 : direction === "right" ? 8 : 0))),
      y: Math.min(82, Math.max(36, current.screen.y + (direction === "forward" ? -7 : direction === "back" ? 7 : 0))),
    };
    const position = nudge(current.position, 0, direction, meters);
    onPiecesChange((list) => list.map((piece) => (piece.id === current.id ? { ...piece, position, screen } : piece)));
    if (sdk && current.tagId) void moveInTour(sdk, current.tagId, position, current.stem);
  }

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setValue("");
    const result = tourAgentReply(trimmed, pieces.length);
    if (result.action.type === "move") slide(result.action.direction, result.action.meters);
    else if (result.action.type === "add") stage(result.action.kind, result.action.label);
    setMessages((current) => [...current, { role: "user", text: trimmed }, { role: "agent", text: result.reply }]);
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    send(value);
  }

  return (
    <>
      <div
        className={`absolute right-20 top-5 z-20 h-20 w-20 transition-opacity duration-300 ${
          open ? "pointer-events-none opacity-0" : ""
        }`}
      >
        <span className="pointer-events-none absolute -inset-2 animate-agent-vibrate rounded-full border-2 border-accent" aria-hidden />
        <span className="pointer-events-none absolute inset-0 animate-agent-ring rounded-full border-2 border-accent" aria-hidden />
        <span
          className="pointer-events-none absolute inset-0 animate-agent-ring rounded-full border-2 border-accent/70 [animation-delay:0.55s]"
          aria-hidden
        />
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          aria-label="Open layout agent"
          aria-expanded={open}
          className="relative flex h-20 w-20 animate-agent-vibrate items-center justify-center rounded-full bg-accent text-background shadow-[0_14px_32px_rgb(0_0_0/0.35)]"
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M12 3.5v2" strokeLinecap="round" />
            <circle cx="12" cy="2.6" r="1" fill="currentColor" stroke="none" />
            <rect x="4.5" y="6.5" width="15" height="12" rx="4" />
            <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
            <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
            <path d="M9 15.2h6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <aside
        aria-hidden={!open}
        className={`absolute bottom-3 right-3 top-3 z-30 flex w-[min(calc(100%-1.5rem),24rem)] flex-col overflow-hidden rounded-[1.75rem] bg-background font-sans font-medium tracking-tight text-foreground shadow-[0_24px_60px_rgb(27_26_23/0.22)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? "translate-x-0" : "pointer-events-none translate-x-[110%]"
        }`}
      >
        <div className="flex shrink-0 items-start gap-3 px-4 pb-2 pt-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-panel text-foreground" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M4 14v2.5A1.5 1.5 0 0 0 5.5 18H7" strokeLinecap="round" />
              <path d="M17 18h1.5A1.5 1.5 0 0 0 20 16.5V14" strokeLinecap="round" />
              <path d="M4 13.5C4 10 6.5 8 9 8h6c2.5 0 5 2 5 5.5V14H4v-.5z" />
              <path d="M7 8V6.5A1.5 1.5 0 0 1 8.5 5h7A1.5 1.5 0 0 1 17 6.5V8" />
            </svg>
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-lg leading-tight">Layout agent</p>
            <p className="mt-0.5 text-sm text-foreground/45">Restage this room live as you type</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close layout agent"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-panel text-foreground transition-colors hover:bg-foreground/10"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
              <path d="M2 2l10 10M12 2L2 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
          <div className="rounded-2xl bg-panel px-4 py-3.5">
            <div className="flex gap-3">
              <span className="mt-0.5 text-foreground" aria-hidden>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 1.2l.7 2.2 2.2.7-2.2.7L8 7l-.7-2.2L5.1 4.1l2.2-.7L8 1.2zM12.2 8.2l.45 1.35 1.35.45-1.35.45-.45 1.35-.45-1.35-1.35-.45 1.35-.45.45-1.35z" />
                </svg>
              </span>
              <div>
                <p className="leading-snug">Describe any furniture or layout changes.</p>
                <p className="mt-1 text-sm leading-snug text-foreground/55">
                  I’ll restage this room in the tour as you type, so you can see updates in real time.
                </p>
              </div>
            </div>
          </div>

          {messages.map((message, index) =>
            message.role === "user" ? (
              <div key={`${message.role}-${index}`} className="ml-auto w-fit max-w-[85%] rounded-full bg-accent px-4 py-2 text-sm text-background">
                {message.text}
              </div>
            ) : (
              <div key={`${message.role}-${index}`} className="flex items-start gap-2">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-foreground/10 text-foreground" aria-hidden>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                    <path d="M3 10.5V12h1.2M11.8 12H13v-1.5" strokeLinecap="round" />
                    <path d="M3 10c0-2 1.6-3.2 3.4-3.2h3.2C11.4 6.8 13 8 13 10v.4H3V10z" />
                  </svg>
                </span>
                <div className="max-w-[85%] rounded-2xl bg-panel px-3.5 py-2.5 text-sm leading-snug">{message.text}</div>
              </div>
            ),
          )}

          <div className="pt-2">
            <p className="mb-2 text-sm text-foreground/60">Try a quick change</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => send(suggestion)}
                  className="rounded-full border border-foreground/15 bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-panel"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </div>

        <form onSubmit={submit} className="shrink-0 px-3 pb-3">
          <div className="flex items-center gap-1.5 rounded-full bg-panel p-1">
            <button
              type="button"
              onClick={() => inputRef.current?.focus()}
              className="shrink-0 rounded-full bg-[#d5d0c6] px-3.5 py-2 text-sm text-foreground"
            >
              Edit
            </button>
            <input
              ref={inputRef}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="change, like “add a rug”…"
              className="min-w-0 flex-1 bg-transparent px-1.5 text-sm text-foreground outline-none placeholder:text-foreground/35"
            />
            <button
              type="submit"
              disabled={!value.trim()}
              aria-label="Send"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-background transition-opacity disabled:opacity-40"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M8 13V3M4.5 6.5 8 3l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}

export function TourGhosts({
  pieces,
  sdk,
  onPiecesChange,
}: {
  pieces: StagedPiece[];
  sdk: MpSdk | null;
  onPiecesChange: (next: StagedPiece[] | ((current: StagedPiece[]) => StagedPiece[])) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [anchored, setAnchored] = useState<Record<string, { x: number; y: number; visible: boolean }>>({});
  const cameraPose = useRef<Parameters<MpSdk["Conversion"]["worldToScreen"]>[1] | null>(null);
  const dragId = useRef<string | null>(null);
  const movedAt = useRef(0);
  const moveTicket = useRef(0);
  const silenced = useRef(new Set<string>());

  useEffect(() => {
    if (!sdk) return;
    for (const piece of pieces) {
      if (!piece.tagId || silenced.current.has(piece.tagId)) continue;
      silenced.current.add(piece.tagId);
      const tagId = piece.tagId;
      void sdk.Tag.allowAction(tagId, { opening: false, navigating: false, docking: false, sharing: false }).catch(() => {});
      void sdk.Tag.close(tagId).catch(() => {});
    }
  }, [sdk, pieces]);

  // Keep each label on its pin as the camera moves.
  useEffect(() => {
    if (!sdk) return;

    function project(pose: NonNullable<(typeof cameraPose)["current"]>) {
      const root = rootRef.current;
      if (!root) return;
      const size = { w: root.clientWidth, h: root.clientHeight };
      const next: Record<string, { x: number; y: number; visible: boolean }> = {};
      for (const piece of pieces) {
        if (!piece.tagId) continue;
        const stem = piece.stem ?? uprightStem(piece.kind);
        const screen = sdk!.Conversion.worldToScreen(
          { x: piece.position.x + stem.x, y: piece.position.y + stem.y, z: piece.position.z + stem.z },
          pose,
          size,
        );
        next[piece.id] = {
          x: screen.x,
          y: screen.y,
          visible:
            Number.isFinite(screen.x) &&
            Number.isFinite(screen.y) &&
            screen.z > 0 &&
            screen.x > -160 &&
            screen.x < size.w + 160 &&
            screen.y > -160 &&
            screen.y < size.h + 160,
        };
      }
      setAnchored(next);
    }

    const cached = cameraPose.current;
    if (cached) queueMicrotask(() => project(cached));

    const subscription = sdk.Camera.pose.subscribe((pose) => {
      cameraPose.current = pose;
      project(pose);
    });
    return () => subscription.cancel();
  }, [sdk, pieces]);

  async function movePinToCursor(piece: StagedPiece, clientX: number, clientY: number) {
    const root = rootRef.current;
    if (!root || !sdk || !piece.tagId) return null;
    const box = root.getBoundingClientRect();
    const ticket = ++moveTicket.current;
    const placed = await placeOnSurface(
      sdk,
      { x: clientX - box.left, y: clientY - box.top },
      piece.kind,
      cameraPose.current?.position,
    );
    if (!placed || ticket !== moveTicket.current) return null;
    await moveInTour(sdk, piece.tagId, placed.position, placed.stem);
    if (ticket !== moveTicket.current) return null;
    onPiecesChange((current) =>
      current.map((item) => (item.id === piece.id ? { ...item, position: placed.position, stem: placed.stem } : item)),
    );
    return placed.position;
  }

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {pieces.map((piece) => {
        const tone = furnitureTone(piece.kind);
        const held = drag?.id === piece.id;
        const pin = anchored[piece.id];
        const origin = pin
          ? { left: pin.x, top: pin.y }
          : { left: `${piece.screen.x}%`, top: `${piece.screen.y}%` };
        return (
          <div
            key={piece.id}
            className={`pointer-events-none absolute ${held ? "z-30" : ""} ${pin && !pin.visible && !held ? "invisible" : ""}`}
            style={{ ...origin, transition: "none" }}
          >
            <div className="pointer-events-none absolute left-[-12px] top-4 -translate-x-full">
              <div className={held ? "" : "animate-rise"}>
                <div
                  className="flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 shadow-[0_8px_18px_rgb(0_0_0/0.28)]"
                  style={{ background: tone.soft, color: "#1b1a17" }}
                >
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-background"
                    style={{ background: tone.accent }}
                    aria-hidden
                  >
                    {tone.glyph}
                  </span>
                  <span className="whitespace-nowrap text-xs font-medium tracking-tight">{piece.label}</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              aria-label={`Drag ${piece.label}`}
              className={`pointer-events-auto absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full ${held ? "cursor-grabbing" : "cursor-grab"}`}
              onPointerDown={(event) => {
                const root = rootRef.current;
                if (!root) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                event.stopPropagation();
                dragId.current = piece.id;
                const box = root.getBoundingClientRect();
                setDrag({ id: piece.id, x: event.clientX - box.left, y: event.clientY - box.top });
                if (sdk && piece.tagId) void sdk.Tag.close(piece.tagId).catch(() => {});
              }}
              onPointerMove={(event) => {
                if (dragId.current !== piece.id) return;
                const now = performance.now();
                if (now - movedAt.current < 32) return;
                movedAt.current = now;
                void movePinToCursor(piece, event.clientX, event.clientY);
              }}
              onPointerUp={(event) => {
                if (dragId.current !== piece.id) return;
                dragId.current = null;
                void movePinToCursor(piece, event.clientX, event.clientY).finally(() => setDrag(null));
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
