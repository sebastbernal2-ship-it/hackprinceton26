"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { MpSdk } from "@matterport/sdk";
import type { RoomRect, StructureEdit } from "../lib/floor-layout";
import type { CatalogItem, LayoutDecision } from "../lib/layout-catalog";
import { directionVector, type NumberedWall, type WallEdits } from "../lib/wall-edits";
import { money } from "../lib/layout-catalog";
import { summarizeRooms } from "../lib/layout-fit";
import { furnitureTone, tourAgentReply, type TourKind, type TourMode } from "../lib/tour-agent";
import { floorInFront, moveInTour, nudge, placeOnSurface, pointInFront, readPose, uprightStem, type RoomAnchor, type StagedPiece } from "../lib/tour-scene";
import { furnitureSize } from "../lib/furniture-mesh";

type Message = { role: "agent" | "user"; text: string; products?: { name: string; url?: string; google?: string; image?: string; credit?: string }[] };

type TourChatProps = {
  sdk: MpSdk | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pieces: StagedPiece[];
  onPiecesChange: (next: StagedPiece[] | ((current: StagedPiece[]) => StagedPiece[])) => void;
  mode: TourMode;
  freezerRemoved: boolean;
  hasFreezer: boolean;
  rooms: RoomRect[];
  anchors: RoomAnchor[];
  onStructure: (edit: StructureEdit) => void;
  /** the numbered walls the owner can name, and the edits on them */
  walls?: NumberedWall[];
  wallEdits?: WallEdits;
  onWalls?: (action: Extract<LayoutDecision["action"], { type: "walls" }>) => { addedCost: number; errors: string[] } | void;
  /** the running total lives with the tour design, so it is saved and restored with it */
  total?: number;
  onTotalChange?: (total: number) => void;
  /** the property (for its CoStar, Matterport and Vexcel facts) and its rooms as they are now */
  siteId?: string;
  spaces?: import("../lib/placement").Space[];
};

const FURNITURE_SUGGESTIONS = ["Add a sofa", "Add a dining table for four", "Move it left 1 m"];
const STRUCTURE_SUGGESTIONS = ["Remove wall 2", "Add a pizza oven to the kitchen", "Add a wall across the dining room", "Move the new wall left 1 m"];

const SLOTS = [
  { x: 22, y: 58 },
  { x: 38, y: 66 },
  { x: 14, y: 72 },
  { x: 32, y: 48 },
  { x: 26, y: 78 },
];

export default function TourChat({
  sdk,
  open,
  onOpenChange,
  pieces,
  onPiecesChange,
  mode,
  freezerRemoved,
  hasFreezer,
  rooms,
  onStructure,
  walls = [],
  wallEdits,
  onWalls,
  total: savedTotal = 0,
  onTotalChange,
  siteId,
  spaces = [],
}: TourChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [value, setValue] = useState("");
  const total = savedTotal;
  const setTotal = (next: number) => onTotalChange?.(next);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pieceSeq = useRef(0);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function stage(kind: TourKind, label: string) {
    const size = furnitureSize(kind);
    void spawnPiece({ kind, label, width: size.width, depth: size.depth, room: "" });
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
  }

  function stageFitted(item: CatalogItem, room: string) {
    void spawnPiece({
      kind: item.kind,
      label: `${item.label} · ${item.width} × ${item.depth} m`,
      width: item.width,
      depth: item.depth,
      room,
      custom: item.custom ? { ...item.custom, name: item.product?.name ?? item.label, image: item.product?.image } : undefined,
      product: item.product,
      price: item.price,
    });
  }

  async function spawnPiece(item: { kind: TourKind; label: string; width: number; depth: number; room: string; custom?: StagedPiece["custom"]; product?: StagedPiece["product"]; price?: number }) {
    const pieceId = `${item.kind}-${pieceSeq.current++}`;
    let position = { x: 0, y: 0, z: 0 };
    let yaw = 0;
    if (sdk) {
      const pose = await readPose(sdk);
      yaw = (pose.rotation.y * Math.PI) / 180;
      const floor = await floorInFront(sdk);
      const ahead = pointInFront(pose, 2.2);
      position = floor ?? { x: ahead.x, y: pose.position.y - 1.4, z: ahead.z };
    }
    const slot = SLOTS[pieces.length % SLOTS.length];
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    onPiecesChange((current) => {
      const step = current.length * 0.7;
      const piece: StagedPiece = {
        id: pieceId,
        kind: item.kind,
        label: item.label,
        tagId: null,
        position: { x: position.x + rightX * step, y: position.y, z: position.z + rightZ * step },
        stem: uprightStem(item.kind),
        screen: slot,
        width: item.width,
        depth: item.depth,
        room: item.room,
        yaw,
        custom: item.custom,
        product: item.product,
        price: item.price,
        at: performance.now(),
        placedIn: sdk ? "matterport" : "imagine",
      };
      return [...current, piece];
    });
  }

  /** Slides the latest `count` placed objects whose name matches (or the last one placed). Free. */
  function movePieces(item: string, dx: number, dz: number, count = 1) {
    const needle = item.toLowerCase().replace(/s$/, "");
    onPiecesChange((list) => {
      const matching = list.filter((piece) => needle && piece.label.toLowerCase().includes(needle));
      const targets = new Set((matching.length ? matching : list).slice(-Math.max(1, count)).map((piece) => piece.id));
      return list.map((piece) =>
        targets.has(piece.id) ? { ...piece, offset: { dx: (piece.offset?.dx ?? 0) + dx, dz: (piece.offset?.dz ?? 0) + dz } } : piece,
      );
    });
  }

  /** Applies the agent's changes; returns the real running total and any wall that could not be built. */
  function applyDecision(decision: LayoutDecision): { total: number; errors: string[] } {
    let realTotal = decision.total;
    const errors: string[] = [];
    for (const action of decision.actions ?? [decision.action]) {
      if (action.type === "add") {
        for (let i = 0; i < (action.count ?? 1); i += 1) stageFitted(action.item, action.room);
      } else if (action.type === "walls") {
        const result = onWalls?.(action);
        if (result && action.add.length) {
          // the agent only estimated new walls; charge what was actually built, at its real length
          realTotal += result.addedCost - action.price;
          errors.push(...result.errors);
        }
      }
      else if (action.type === "move-piece") movePieces(action.item, action.dx, action.dz, action.count);
      else if (action.type === "structure" && mode === "foreground") onStructure(action.edit);
    }
    realTotal = Math.max(0, Math.round(realTotal));
    setTotal(realTotal);
    return { total: realTotal, errors };
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setValue("");
    setBusy(true);
    setMessages((current) => [...current, { role: "user", text: trimmed }]);
    try {
      const response = await fetch("/api/layout-agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          mode,
          siteId,
          rooms: spaces.length ? spaces : summarizeRooms(rooms),
          placed: pieces.map((piece) => ({
            item: piece.label,
            room: piece.room || "",
            width: piece.width || 1,
            depth: piece.depth || 1,
          })),
          total,
          walls: walls.map((w) => ({ number: w.number, length: Math.round(w.length * 10) / 10, role: w.role, between: w.between, removed: wallEdits?.removed[w.key] !== undefined })),
        }),
      });
      const decision = (await response.json()) as LayoutDecision & { error?: string };
      if (!response.ok || !decision.reply) throw new Error(decision.error || "unavailable");
      const applied = applyDecision(decision);
      // the agent's sentence quotes its own estimate; show the real total, and say plainly what could not be built
      const actions = decision.actions ?? [decision.action];
      const wallAdds = actions.reduce((sum, action) => sum + (action.type === "walls" ? action.add.length : 0), 0);
      const otherChanges = actions.some(
        (action) => action.type !== "none" && !(action.type === "walls" && !action.remove.length && !action.restore.length && !(action.move ?? []).length),
      );
      const builtSomething = otherChanges || wallAdds > applied.errors.length;
      const reply =
        applied.errors.length && !builtSomething
          ? `${applied.errors.join(" ")} Nothing was charged. Running total ${money(applied.total)}.`
          : decision.reply.replace(/Running total \$[\d,]+\.?/, `Running total ${money(applied.total)}.`) +
            (applied.errors.length ? ` But: ${applied.errors.join(" ")} Nothing was charged for that.` : "");
      const products = (decision.actions ?? [decision.action]).flatMap((action) =>
        action.type === "add" && action.item.product ? [action.item.product] : [],
      );
      setMessages((current) => [...current, { role: "agent", text: reply, products }]);
    } catch {
      // Gemini unreachable: wall numbers are still understood locally
      const numbers = /\bwalls?\b/i.test(trimmed) ? [...trimmed.matchAll(/\d+/g)].map((m) => Number(m[0])).filter((n) => walls.some((w) => w.number === n)) : [];
      const moveMatch = trimmed.match(/\b(left|right|forward|back|backward|up|down)\b(?:\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*(?:m|meters?|metres?)?)?/i);
      if (/\bmove|slide|shift|push\b/i.test(trimmed) && moveMatch) {
        const { dx, dz } = directionVector(moveMatch[1], Number(moveMatch[2] ?? 1));
        const movable = numbers.filter((n) => walls.find((w) => w.number === n)?.role === "added");
        if (movable.length) {
          onWalls?.({ type: "walls", remove: [], restore: [], add: [], move: movable.map((wall) => ({ wall, dx, dz })), price: 0 });
          setMessages((current) => [...current, { role: "agent", text: `Moved wall${movable.length > 1 ? "s" : ""} ${movable.join(", ")}. No charge for moving.` }]);
          return;
        }
        if (!numbers.length && pieces.length) {
          const what = trimmed.replace(/^.*?\b(?:move|slide|shift|push)\s+(?:the\s+)?/i, "").split(/\s+(?:left|right|forward|back|backward|up|down)\b/i)[0];
          movePieces(what, dx, dz);
          setMessages((current) => [...current, { role: "agent", text: `Moved the ${what || "last piece"}. No charge for moving.` }]);
          return;
        }
      }
      if (numbers.length && /remove|take down|knock|delete|demolish|tear/i.test(trimmed)) {
        onWalls?.({ type: "walls", remove: numbers, restore: [], add: [], price: 0 });
        setMessages((current) => [...current, { role: "agent", text: `Taking down wall${numbers.length > 1 ? "s" : ""} ${numbers.join(", ")}.` }]);
        return;
      }
      if (numbers.length && /restore|put back|rebuild|undo/i.test(trimmed)) {
        onWalls?.({ type: "walls", remove: [], restore: numbers, add: [], price: 0 });
        setMessages((current) => [...current, { role: "agent", text: `Putting back wall${numbers.length > 1 ? "s" : ""} ${numbers.join(", ")}.` }]);
        return;
      }
      const result = tourAgentReply(trimmed, pieces.length, { mode, freezerRemoved, hasFreezer });
      if (result.action.type === "structure") onStructure(result.action.edit);
      else if (result.action.type === "move") slide(result.action.direction, result.action.meters);
      else if (result.action.type === "add") stage(result.action.kind, result.action.label);
      setMessages((current) => [...current, { role: "agent", text: result.reply }]);
    } finally {
      setBusy(false);
    }
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
            <p className="mt-0.5 text-sm text-foreground/45">
              {mode === "foreground" ? "Add any object, or change walls by number" : "Restage this room live as you type"}
            </p>
            <p className="mt-1 text-sm text-foreground/70">Running total {money(total)}</p>
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
                <p className="leading-snug">
                  {mode === "foreground" ? "Type any object, or name a wall by its number." : "Describe any furniture or layout changes."}
                </p>
                <p className="mt-1 text-sm leading-snug text-foreground/55">
                  {mode === "foreground"
                    ? "“Add a piano”, “remove walls 2 and 5”, “put wall 2 back”, “add a wall across the kitchen”, “move wall 11 left 1 m”, “move the piano right 2 m”. Removed walls turn red and sink; new walls rise in green. Moving walls you added, or objects, is free."
                    : "I’ll restage this room in the tour as you type, so you can see updates in real time."}
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
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-panel px-3.5 py-2.5 text-sm leading-snug">
                  {message.text}
                  {message.products?.map((product) => (
                    <span key={`${product.name}-${product.url ?? ""}`} className="mt-2.5 flex items-center gap-3 rounded-xl bg-background p-2">
                      {product.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.image} alt={product.name} className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-panel text-xs text-foreground/40">No photo</span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-foreground">{product.name}</span>
                        <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
                          {product.google && (
                            <a href={product.google} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
                              See it on Google
                            </a>
                          )}
                          {product.url && (
                            <a href={product.url} target="_blank" rel="noreferrer" className="truncate text-foreground/55 underline-offset-2 hover:underline">
                              {new URL(product.url).hostname.replace(/^www\./, "")}
                            </a>
                          )}
                        </span>
                        {product.credit && <span className="block truncate text-[0.7rem] text-foreground/45">Similar photo · {product.credit}</span>}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            ),
          )}

          {busy ? (
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-foreground/10 text-foreground" aria-hidden>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M3 10.5V12h1.2M11.8 12H13v-1.5" strokeLinecap="round" />
                  <path d="M3 10c0-2 1.6-3.2 3.4-3.2h3.2C11.4 6.8 13 8 13 10v.4H3V10z" />
                </svg>
              </span>
              <div className="max-w-[85%] rounded-2xl bg-panel px-3.5 py-2.5 text-sm leading-snug text-foreground/60">Checking the measurements…</div>
            </div>
          ) : null}

          <div className="pt-2">
            <p className="mb-2 text-sm text-foreground/60">Try a quick change</p>
            <div className="flex flex-wrap gap-2">
              {(mode === "foreground" ? STRUCTURE_SUGGESTIONS : FURNITURE_SUGGESTIONS).map((suggestion) => (
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
              placeholder={mode === "foreground" ? "like “add a fish tank” or “remove wall 3”…" : "change, like “add a dining table”…"}
              className="min-w-0 flex-1 bg-transparent px-1.5 text-sm text-foreground outline-none placeholder:text-foreground/35"
            />
            <button
              type="submit"
              disabled={busy || !value.trim()}
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
