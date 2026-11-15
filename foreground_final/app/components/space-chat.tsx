"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { OwnerBrief } from "../lib/discover";
import { monthlyRent, type Match } from "../lib/matches";

type Source = { url: string; title: string };
type Message = { role: "agent" | "user"; text: string; sources?: Source[] };

const number = new Intl.NumberFormat("en-US");
const SUGGESTIONS = ["What will the build-out cost?", "Is the rent fair?", "Guests a day to break even?", "Did restaurants fail here?"];

/** A grounded answer from Claude over this space's analysis (/api/ask); the listing facts when it cannot be reached. */
async function answer(match: Match, brief: OwnerBrief | null, question: string): Promise<{ text: string; sources?: Source[] }> {
  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        siteId: match.siteId,
        question,
        brief: {
          concept: brief?.concept ?? "full-service",
          ...(brief?.seats && brief.seats >= 4 ? { seats: brief.seats } : {}),
          ...(brief?.budgetUsd && brief.budgetUsd >= 10_000 ? { budgetUsd: brief.budgetUsd } : {}),
        },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { answer?: string; sources?: Source[]; error?: string };
    if (res.ok && body.answer) return { text: body.answer, sources: body.sources };
    throw new Error(body.error);
  } catch {
    const rent = `$${number.format(monthlyRent(match))}/mo`;
    return { text: `I could not reach the analyst just now. From the listing: ${match.address}${match.detail ? `, ${match.detail}` : ""} is ${number.format(match.squareFeet)} sq ft at about ${rent}.` };
  }
}

export default function SpaceChat({ match, brief, open, onOpenChange }: { match: Match; brief: OwnerBrief | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [value, setValue] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setValue("");
    setMessages((current) => [...current, { role: "user", text: trimmed }, { role: "agent", text: "…" }]);
    void answer(match, brief, trimmed).then((reply) =>
      setMessages((current) => {
        const next = [...current];
        const last = next.findLastIndex((m) => m.role === "agent" && m.text === "…");
        if (last >= 0) next[last] = { role: "agent", text: reply.text, sources: reply.sources };
        return next;
      }),
    );
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    send(value);
  }

  return (
    <aside
      aria-hidden={!open}
      inert={!open}
      className={`fixed bottom-3 right-3 top-3 z-50 flex w-[min(calc(100%-1.5rem),24rem)] flex-col overflow-hidden rounded-[1.75rem] bg-background font-sans font-medium tracking-tight text-foreground shadow-[0_24px_60px_rgb(27_26_23/0.22)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        open ? "translate-x-0" : "pointer-events-none translate-x-[110%]"
      }`}
    >
      <div className="flex shrink-0 items-start gap-3 px-4 pb-2 pt-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-panel text-foreground" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M12 3.5v2" strokeLinecap="round" />
            <circle cx="12" cy="2.6" r="1" fill="currentColor" stroke="none" />
            <rect x="4.5" y="6.5" width="15" height="12" rx="4" />
            <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
            <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
            <path d="M9 15.2h6" strokeLinecap="round" />
          </svg>
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-lg leading-tight">Space agent</p>
          <p className="mt-0.5 text-sm text-foreground/45">Answers from this space&apos;s data and the web</p>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close space agent"
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
              <p className="leading-snug">Ask anything about {match.detail || match.address}.</p>
              <p className="mt-1 text-sm leading-snug text-foreground/55">
                Costs and history come from CoStar, Matterport and Vexcel; for anything else, like foot traffic or nearby restaurants, it searches the web.
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
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M12 3.5v2" strokeLinecap="round" />
                  <rect x="4.5" y="6.5" width="15" height="12" rx="4" />
                  <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
                  <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
                </svg>
              </span>
              <div className="max-w-[85%] rounded-2xl bg-panel px-3.5 py-2.5 text-sm leading-snug">
                {message.text === "…" ? (
                  <span className="inline-flex items-center gap-2 text-foreground/50">
                    <span className="inline-block h-2 w-2 animate-breathe rounded-full bg-foreground/50" aria-hidden />
                    Checking the data and the web…
                  </span>
                ) : (
                  message.text
                )}
                {message.sources?.length ? (
                  <span className="mt-2 flex flex-col gap-1 border-t border-foreground/10 pt-2">
                    {message.sources.map((source) => (
                      <a
                        key={source.url}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-xs text-accent underline-offset-2 hover:underline"
                      >
                        {source.title || new URL(source.url).hostname}
                      </a>
                    ))}
                  </span>
                ) : null}
              </div>
            </div>
          ),
        )}

        <div className="pt-2">
          <p className="mb-2 text-sm text-foreground/60">Try a quick question</p>
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
            Ask
          </button>
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="rent, size, the block…"
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
  );
}
