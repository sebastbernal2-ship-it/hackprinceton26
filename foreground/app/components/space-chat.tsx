"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { isScanOnly, type Match } from "../lib/matches";
import { answerFio, FIO_CHIPS, loadFioContext, type FioContext } from "../lib/fio";

type Message = { role: "agent" | "user"; text: string };

export default function SpaceChat({ match, open, onOpenChange }: { match: Match; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<{ id: number; c: FioContext } | null>(null);
  const ctx = loaded?.id === match.listingId ? loaded.c : null;

  // Fetch the property's evidence once Fio is opened; answers cite it. A failed endpoint is null and Fio says so.
  useEffect(() => {
    if (!open || ctx) return;
    let live = true;
    loadFioContext(match.listingId, "", isScanOnly(match)).then((c) => live && setLoaded({ id: match.listingId, c }));
    return () => {
      live = false;
    };
  }, [open, ctx, match.listingId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setValue("");
    setMessages((current) => [...current, { role: "user", text: trimmed }]);
    setBusy(true);
    const c = ctx ?? (await loadFioContext(match.listingId, "", isScanOnly(match)));
    setBusy(false);
    setLoaded({ id: match.listingId, c });
    setMessages((current) => [...current, { role: "agent", text: answerFio(match, c, trimmed) }]);
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
          <p className="text-lg leading-tight">Fio</p>
          <p className="mt-0.5 text-sm text-foreground/45">Ask about this listing</p>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close Fio"
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
                Answers come from this property&apos;s own data: match facts, estimated seats, costs, structure, tenant history. Figures marked estimated are estimates, not quotes.
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
              <div className="max-w-[85%] rounded-2xl bg-panel px-3.5 py-2.5 text-sm leading-snug">{message.text}</div>
            </div>
          ),
        )}

        {busy && <p className="px-1 text-sm text-foreground/50">Fio is checking this property&apos;s data…</p>}

        <div className="pt-2">
          <p className="mb-2 text-sm text-foreground/60">Ask Fio</p>
          <div className="flex flex-wrap gap-2">
            {FIO_CHIPS.map((suggestion) => (
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
            placeholder="cost, seats, hazards, next steps…"
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
