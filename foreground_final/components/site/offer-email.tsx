"use client";

import { useEffect, useState } from "react";

type Brief = { concept: string; seats?: number; budgetUsd?: number };
type State = { status: "loading" } | { status: "ready"; source: "claude" | "template" } | { status: "error" };

const btn =
  "h-9 rounded-sm bg-ink px-3 text-sm font-semibold text-on-ink transition-[transform,background-color] hover:bg-ink/90 active:scale-[0.97] disabled:opacity-50";

/** Email draft to the listing broker: generated on load, then fully editable. */
export function OfferEmail({ siteId, brief, fallback }: { siteId: string; brief: Brief; fallback: string }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<State>({ status: "loading" });
  const [copied, setCopied] = useState(false);
  const [nonce, setNonce] = useState(0);
  const briefKey = JSON.stringify(brief);

  useEffect(() => {
    // "loading" is the initial state; "Draft again" resets it before bumping the nonce
    const ctrl = new AbortController();
    fetch("/api/offer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ siteId, brief: JSON.parse(briefKey) }),
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad response"))))
      .then((d: { email: string; source: "claude" | "template" }) => {
        setText(d.email);
        setState({ status: "ready", source: d.source });
      })
      .catch((e) => {
        if (ctrl.signal.aborted || e?.name === "AbortError") return;
        setText(fallback);
        setState({ status: "error" });
      });
    return () => ctrl.abort();
  }, [siteId, briefKey, fallback, nonce]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: the text stays selectable in the box */
    }
  }

  const loading = state.status === "loading";
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="offer-email" className="text-xs font-medium uppercase tracking-[0.06em] text-ink-2">
        Email to the listing broker
      </label>
      <div className="relative">
        <textarea
          id="offer-email"
          value={loading ? "" : text}
          onChange={(e) => setText(e.target.value)}
          readOnly={loading}
          rows={16}
          aria-busy={loading}
          placeholder={loading ? "Drafting from your ask list…" : ""}
          className="w-full rounded-sm border border-rule-strong bg-paper p-3 text-sm leading-relaxed text-ink transition-colors hover:border-ink focus-visible:border-ink"
        />
        {loading ? <div aria-hidden className="pointer-events-none absolute inset-x-3 top-3 grid gap-2">{[92, 70, 85, 60, 78, 40].map((w, i) => <div key={i} className="h-3 animate-pulse rounded-sm bg-paper-2" style={{ width: `${w}%` }} />)}</div> : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" onClick={copy} disabled={loading || !text} className={btn}>
          {copied ? "Copied" : "Copy email"}
        </button>
        <button type="button" onClick={() => {
            setState({ status: "loading" });
            setNonce((n) => n + 1);
          }} disabled={loading} className="text-sm text-ink-2 underline hover:text-ink disabled:opacity-50">
          Draft again
        </button>
        <span role="status" className="font-mono text-[0.6875rem] text-ink-2">
          {state.status === "loading"
            ? "Drafting…"
            : state.status === "ready" && state.source === "claude"
              ? "src drafted by Claude from the ask list above; edit freely"
              : "src template from the ask list (the drafting service was unavailable); edit freely"}
        </span>
      </div>
    </div>
  );
}
