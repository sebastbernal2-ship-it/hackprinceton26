"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type Dispatch } from "react";
import type { OwnerBrief } from "@/lib/engine";
import { OpsSchema, applyOps, type ItemType, type Layout, type Op } from "@/lib/layout";
import type { Site } from "@/lib/sites/schema";
import { addAtEdit, moveEdit, removeEdit, rotateEdit, type Edit } from "./layout/edit";
import type { FlowEvent } from "./flow-reducer";

export type LayoutEditor = {
  layout: Layout | null;
  suggested: Layout | null;
  canUndo: boolean;
  canRedo: boolean;
  /** bumps when a change should fly (typed instruction, undo, redo, reset) rather than snap (a drag) */
  flight: number;
  /** a typed instruction is with the planner */
  busy: boolean;
  /** the last refusal or note, in words, shown under the plan */
  notice: { text: string; tone: "needed" | "info" } | null;
  clearNotice: () => void;
  move: (id: string, x: number, y: number) => boolean;
  addAt: (type: ItemType, x: number, y: number) => boolean;
  /** palette click: the engine picks a free spot in the item's own zone */
  addAuto: (type: ItemType) => void;
  remove: (id: string) => void;
  rotate: (id: string) => boolean;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  instruct: (text: string) => Promise<void>;
};

export const LayoutEditorContext = createContext<LayoutEditor | null>(null);
export const useLayoutEditor = () => useContext(LayoutEditorContext);

type Source = "claude" | "offline";
const SOURCE_LABEL: Record<Source, string> = { claude: "Claude", offline: "Offline parser" };

/**
 * The Layout chapter's editing state machine over the flow reducer's plan, history and op log. Pointer edits are
 * pure (`./layout/edit.ts`) and commit on release; typed instructions go to /api/layout with the real brief, and the
 * ops it returns run through `applyOps` here. Nothing is shown unless the engine placed it.
 */
export function useLayoutEditorState(args: {
  dispatch: Dispatch<FlowEvent>;
  layout: Layout | null;
  suggested: Layout | null;
  past: number;
  future: number;
  site: Site | null;
  brief: OwnerBrief | null;
}): LayoutEditor {
  const { dispatch, layout, suggested, past, future, site, brief } = args;
  const [flight, setFlight] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<LayoutEditor["notice"]>(null);
  const latest = useRef({ layout, site, brief });
  useEffect(() => {
    latest.current = { layout, site, brief };
  });

  const apply = useCallback(
    (edit: Edit, fly = false): boolean => {
      if ("error" in edit) {
        setNotice({ text: edit.error, tone: "needed" });
        return false;
      }
      if (edit.layout === latest.current.layout) return true;
      setNotice(null);
      dispatch({ type: "layoutCommit", layout: edit.layout, ops: edit.ops });
      if (fly) setFlight((f) => f + 1);
      return true;
    },
    [dispatch],
  );

  const move = useCallback((id: string, x: number, y: number) => (latest.current.layout ? apply(moveEdit(latest.current.layout, id, x, y)) : false), [apply]);
  const addAt = useCallback((type: ItemType, x: number, y: number) => (latest.current.layout ? apply(addAtEdit(latest.current.layout, type, x, y)) : false), [apply]);
  const remove = useCallback((id: string) => void (latest.current.layout && apply(removeEdit(latest.current.layout, id))), [apply]);
  const rotate = useCallback((id: string) => (latest.current.layout ? apply(rotateEdit(latest.current.layout, id)) : false), [apply]);

  const addAuto = useCallback(
    (type: ItemType) => {
      const { layout: l, site: s, brief: b } = latest.current;
      if (!l || !s || !b) return;
      const op: Op = { op: "add", type, count: 1 };
      const result = applyOps(l, [op], { site: s, brief: b });
      if (result.layout.items.length === l.items.length) return setNotice({ text: result.notes[0] ?? "There is no free spot for that.", tone: "needed" });
      apply({ layout: result.layout, ops: [op] }, true);
    },
    [apply],
  );

  const reset = useCallback(() => {
    if (!suggested) return;
    setNotice(null);
    dispatch({ type: "layoutCommit", layout: suggested, ops: [] });
    setFlight((f) => f + 1);
  }, [dispatch, suggested]);

  const undo = useCallback(() => {
    setNotice(null);
    dispatch({ type: "undo" });
    setFlight((f) => f + 1);
  }, [dispatch]);
  const redo = useCallback(() => {
    setNotice(null);
    dispatch({ type: "redo" });
    setFlight((f) => f + 1);
  }, [dispatch]);

  const say = useCallback(
    (text: string, source?: string) => dispatch({ type: "append", at: Date.now(), message: { kind: "assistantText", text, streaming: false, source } }),
    [dispatch],
  );

  const instruct = useCallback(
    async (text: string) => {
      const { layout: l, site: s, brief: b } = latest.current;
      const ask = text.trim();
      if (!l || !s || !b || ask.length < 2) return;
      dispatch({ type: "append", at: Date.now(), message: { kind: "user", text: ask } });
      setBusy(true);
      try {
        const res = await fetch("/api/layout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ siteId: s.id, layout: l, instruction: ask, brief: { seats: b.seats, budgetUsd: b.budgetUsd } }),
          signal: AbortSignal.timeout(25_000),
        });
        const data = (await res.json()) as { ops?: unknown; explanation?: string; source?: Source; error?: string };
        const ops = OpsSchema.safeParse(data.ops);
        if (!res.ok || !ops.success) return say(data.error ?? "The planner sent back something unreadable. Try rephrasing, or drag the pieces yourself.");
        const source = data.source ? SOURCE_LABEL[data.source] : undefined;
        if (ops.data.length === 0) return say(data.explanation || "Nothing to change on the plan for that.", source);
        // the plan may have moved while the model answered: apply to the plan as it is now
        const current = latest.current.layout ?? l;
        const result = applyOps(current, ops.data, { site: s, brief: b });
        dispatch({ type: "layoutCommit", layout: result.layout, ops: ops.data });
        setFlight((f) => f + 1);
        setNotice(null);
        say([data.explanation, ...result.notes].filter(Boolean).join(" "), source);
      } catch {
        say("The planner did not answer. Check the connection and try again, or drag the pieces yourself.");
      } finally {
        setBusy(false);
      }
    },
    [dispatch, say],
  );

  return {
    layout,
    suggested,
    canUndo: past > 0,
    canRedo: future > 0,
    flight,
    busy,
    notice,
    clearNotice: useCallback(() => setNotice(null), []),
    move,
    addAt,
    addAuto,
    remove,
    rotate,
    undo,
    redo,
    reset,
    instruct,
  };
}
