import { detectConcept } from "@/lib/agent/brief";
import type { OwnerBrief } from "@/lib/engine/types";
import type { Layout, Op } from "@/lib/layout";
import { briefQuery, briefSummary, clarifyPrompt, missingFields, readAnswer, readConcept, type ClarifyField } from "./brief-flow";
import type { Chapter } from "./chapter-model";
import type { FlowPhase, Message, MessageBody, MessageOf } from "./types";

/**
 * The flow's state machine. Pure: time and the parsed brief come in on the event, ids come from a counter in
 * the state. `useFlow` (use-flow.ts) is the React wrapper.
 */

/** the light facts about a space the thread shows before the engine reports numbers */
export type FlowSpace = { siteId: string; photo: string; address: string; city?: string; sf?: number; hasScan?: boolean };

export type FlowState = {
  phase: FlowPhase;
  messages: Message[];
  /** the brief so far: the owner's words plus their clarify answers */
  brief: OwnerBrief | null;
  /** the first prompt, verbatim, and what it parsed to on its own */
  briefText: string;
  said: OwnerBrief | null;
  /** clarify questions already asked (each at most once; an unreadable answer rewords the same question) */
  asked: ClarifyField[];
  /** did the owner's own words name a concept, and does the brief now hold one the owner stated or chose */
  conceptStated: boolean;
  conceptKnown: boolean;
  /** once a space is chosen: the open chapter, the ones visited, and the owner's plan with its undo history */
  chapter: Chapter;
  visited: Chapter[];
  layout: Layout | null;
  opLog: Op[];
  past: Layout[];
  future: Layout[];
  /** set once the brief is complete: the text to search with */
  query: string | null;
  /** next message id; survives a reset so ids never repeat in a session */
  seq: number;
  spaces: FlowSpace[];
};

export type FlowEvent =
  /** the owner typed something; `parsed` is parseBriefRegex(text) */
  | { type: "send"; text: string; parsed: OwnerBrief; at: number }
  /** the owner tapped a clarify chip */
  | { type: "answer"; messageId: string; value: string | number; at: number }
  /** add any message (search, picks, walk steps...). Returns nothing; read the id from state or use `update` by kind */
  | { type: "append"; message: MessageBody; at: number }
  /** change one message in place, e.g. tick a searchProgress forward or end streaming */
  | { type: "update"; id: string; update: (m: Message) => Message }
  | { type: "phase"; phase: FlowPhase }
  /** the walk stands at tour stop `index` of this site: that step is active, every other step is visited */
  | { type: "walkActive"; siteId: string; index: number }
  | { type: "pick"; siteId: string; at?: number }
  | { type: "chapter"; chapter: Chapter; at: number }
  /** the suggested plan for the chosen space has loaded; replaces any plan and clears history */
  | { type: "layoutReady"; layout: Layout }
  /** a committed edit: the new plan and the ops that made it; the old plan goes on the undo stack */
  | { type: "layoutCommit"; layout: Layout; ops: Op[] }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "back" }
  | { type: "reset" };

const WALK_KINDS: ReadonlySet<Message["kind"]> = new Set(["walkStep", "imagineResult", "outlookChart", "offerCta", "chapterDivider"]);
export const HISTORY_LIMIT = 50;

/** the per-space part of the state, cleared when the owner leaves a space */
const NO_SPACE = {
  chapter: "overview" as Chapter,
  visited: [] as Chapter[],
  layout: null,
  opLog: [] as Op[],
  past: [] as Layout[],
  future: [] as Layout[],
};

export function createFlowState(init: { spaces?: FlowSpace[] } = {}): FlowState {
  return {
    phase: "ask",
    messages: [],
    brief: null,
    briefText: "",
    said: null,
    asked: [],
    conceptStated: true,
    conceptKnown: true,
    ...NO_SPACE,
    query: null,
    seq: 1,
    spaces: init.spaces ?? [],
  };
}

function push(state: FlowState, body: MessageBody, at: number): FlowState {
  const message = { ...body, id: `m${state.seq}`, at } as Message;
  return { ...state, seq: state.seq + 1, messages: [...state.messages, message] };
}

/** the clarify question still waiting for an answer, if any */
export function pendingClarify(state: FlowState): (MessageOf<"clarifyChips"> & { field: ClarifyField }) | null {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const m = state.messages[i];
    if (m.kind === "clarifyChips" && m.answer === undefined && (m.field === "concept" || m.field === "seats" || m.field === "budgetUsd")) {
      return m as MessageOf<"clarifyChips"> & { field: ClarifyField };
    }
  }
  return null;
}

/** the newest message of a kind, e.g. the running searchProgress */
export function lastOfKind<K extends Message["kind"]>(state: FlowState, kind: K): MessageOf<K> | null {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const m = state.messages[i];
    if (m.kind === kind) return m as MessageOf<K>;
  }
  return null;
}

/** After the brief changes: ask the next missing thing once, or confirm the brief and start the search. */
function advance(state: FlowState, at: number): FlowState {
  const brief = state.brief;
  if (!brief) return state;
  const next = missingFields(brief, state.conceptKnown).find((f) => !state.asked.includes(f));
  if (next) {
    const prompt = clarifyPrompt(next, brief);
    return push(
      { ...state, phase: "clarify", asked: [...state.asked, next] },
      { kind: "clarifyChips", question: prompt.question, field: next, options: prompt.options, allowFreeText: true },
      at,
    );
  }
  const query = briefQuery(state.briefText, state.said ?? brief, brief, state.conceptStated);
  const confirmed = push(
    { ...state, phase: "search", query },
    { kind: "assistantText", text: briefSummary(brief, state.spaces.length), streaming: false },
    at,
  );
  return push(
    confirmed,
    {
      kind: "searchProgress",
      status: "running",
      headline: "Looking through every space",
      checked: 0,
      total: state.spaces.length,
      candidates: state.spaces.map((s) => ({ siteId: s.siteId, photo: s.photo, address: s.address, state: "queued" })),
    },
    at,
  );
}

function settle(state: FlowState, messageId: string, field: ClarifyField, value: number | string): FlowState {
  return {
    ...state,
    brief: { ...(state.brief as OwnerBrief), [field]: value },
    conceptKnown: state.conceptKnown || field === "concept",
    messages: state.messages.map((m) => (m.id === messageId && m.kind === "clarifyChips" ? { ...m, answer: value } : m)),
  };
}

/** the reply could not be read: say so on the same question and keep it open. A number is never assumed. */
function askAgain(state: FlowState, pending: MessageOf<"clarifyChips">, brief: OwnerBrief): FlowState {
  const prompt = clarifyPrompt(pending.field as ClarifyField, brief, true);
  return {
    ...state,
    brief,
    messages: state.messages.map((m) => (m.id === pending.id && m.kind === "clarifyChips" ? { ...m, question: prompt.question } : m)),
  };
}

/** open a chapter: mark it visited and add the thin divider row to the thread once */
function enterChapter(state: FlowState, chapter: Chapter, at: number): FlowState {
  const last = state.messages[state.messages.length - 1];
  const moved: FlowState = { ...state, chapter, visited: state.visited.includes(chapter) ? state.visited : [...state.visited, chapter] };
  if (last?.kind === "chapterDivider" && last.chapter === chapter) return moved;
  // hopping through chapters must not stack empty dividers: the newest one replaces a divider with nothing under it
  const base: FlowState = last?.kind === "chapterDivider" ? { ...moved, messages: moved.messages.slice(0, -1) } : moved;
  return push(base, { kind: "chapterDivider", chapter }, at);
}

export function flowReducer(state: FlowState, event: FlowEvent): FlowState {
  switch (event.type) {
    case "send": {
      const text = event.text.trim();
      if (!text) return state;
      const said = push(state, { kind: "user", text }, event.at);

      if (state.phase === "ask" || !state.brief) {
        const stated = detectConcept(text) !== undefined;
        return advance(
          { ...said, brief: event.parsed, said: event.parsed, briefText: text, asked: [], conceptStated: stated, conceptKnown: stated },
          event.at,
        );
      }

      const pending = pendingClarify(state);
      if (pending) {
        // a typed reply can carry more than was asked ("40 seats, $200k, Houston"): keep whatever is still missing
        const brief: OwnerBrief = { ...state.brief };
        if (brief.seats == null && event.parsed.seats != null) brief.seats = event.parsed.seats;
        if (brief.budgetUsd == null && event.parsed.budgetUsd != null) brief.budgetUsd = event.parsed.budgetUsd;
        if (brief.city == null && event.parsed.city != null) brief.city = event.parsed.city;
        const read =
          pending.field === "concept" ? readConcept(text) : (brief[pending.field] ?? readAnswer(pending.field, text, event.parsed));
        if (read == null) return askAgain(said, pending, brief);
        return advance(settle({ ...said, brief }, pending.id, pending.field, read), event.at);
      }

      // nothing is waiting on an answer: the caller routes the text (a question, an Imagine request) by chapter
      return said;
    }

    case "answer": {
      const m = state.messages.find((x) => x.id === event.messageId);
      if (!m || m.kind !== "clarifyChips" || m.answer !== undefined || !state.brief) return state;
      if (m.field === "concept") {
        const concept = readConcept(String(event.value));
        return concept ? advance(settle(state, m.id, "concept", concept), event.at) : state;
      }
      if (m.field !== "seats" && m.field !== "budgetUsd") {
        return { ...state, messages: state.messages.map((x) => (x.id === m.id ? { ...m, answer: event.value } : x)) };
      }
      const value = Number(event.value);
      if (!Number.isFinite(value)) return state;
      return advance(settle(state, m.id, m.field, value), event.at);
    }

    case "append":
      return push(state, event.message, event.at);

    case "update":
      return { ...state, messages: state.messages.map((m) => (m.id === event.id ? event.update(m) : m)) };

    case "phase":
      return state.phase === event.phase ? state : { ...state, phase: event.phase };

    case "walkActive":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.kind === "walkStep" && m.siteId === event.siteId ? { ...m, state: m.index === event.index ? "active" : "visited" } : m,
        ),
      };

    case "pick": {
      const cards = lastOfKind(state, "pickCards");
      if (!cards || !cards.picks.some((p) => p.siteId === event.siteId)) return state;
      const chosen: FlowState = {
        ...state,
        ...NO_SPACE,
        phase: "walk",
        messages: state.messages.map((m) => (m.id === cards.id ? { ...cards, chosenSiteId: event.siteId } : m)),
      };
      return enterChapter(chosen, "overview", event.at ?? cards.at);
    }

    case "chapter":
      return state.phase === "walk" && state.chapter !== event.chapter ? enterChapter(state, event.chapter, event.at) : state;

    case "layoutReady":
      return { ...state, layout: event.layout, opLog: [], past: [], future: [] };

    case "layoutCommit": {
      if (!state.layout) return state;
      return {
        ...state,
        layout: event.layout,
        opLog: [...state.opLog, ...event.ops],
        past: [...state.past, state.layout].slice(-HISTORY_LIMIT),
        future: [],
      };
    }

    case "undo": {
      const prev = state.past[state.past.length - 1];
      if (!prev || !state.layout) return state;
      return { ...state, layout: prev, past: state.past.slice(0, -1), future: [state.layout, ...state.future].slice(0, HISTORY_LIMIT) };
    }

    case "redo": {
      const next = state.future[0];
      if (!next || !state.layout) return state;
      return { ...state, layout: next, past: [...state.past, state.layout].slice(-HISTORY_LIMIT), future: state.future.slice(1) };
    }

    case "back": {
      if (state.phase === "walk" || state.phase === "outlook" || state.phase === "offer") {
        return {
          ...state,
          ...NO_SPACE,
          phase: "pick",
          // the walk belongs to the space just left: its steps, imagined rooms and outlook go with it
          messages: state.messages
            .filter((m) => !WALK_KINDS.has(m.kind))
            .map((m) => (m.kind === "pickCards" ? { ...m, chosenSiteId: undefined } : m)),
        };
      }
      return { ...createFlowState({ spaces: state.spaces }), seq: state.seq };
    }

    case "reset":
      return { ...createFlowState({ spaces: state.spaces }), seq: state.seq };
  }
}
