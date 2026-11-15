"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DUR, REDUCED, SPRING } from "../motion";
import type { MessageRendererProps } from "./registry";

export type OfferBrief = {
  concept: "quick-service" | "fast-casual" | "full-service" | "cafe" | "bar";
  seats?: number;
  budgetUsd?: number;
};

/**
 * Summary, the one bone pill, and the drafted email inline. It POSTs to /api/offer itself, so it needs the brief:
 * pass `brief` (registry wrapper: `(p) => <OfferCtaMessage {...p} brief={briefFromState} />`). `message.state` seeds
 * the local state; the component runs idle -> drafting -> ready on its own.
 */
export function OfferCtaMessage({ message: m, brief }: MessageRendererProps<"offerCta"> & { brief: OfferBrief }) {
  const reduce = useReducedMotion();
  const [state, setState] = useState<"idle" | "drafting" | "ready">(m.state);
  const [email, setEmail] = useState("");
  const [source, setSource] = useState<"claude" | "template" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function draft() {
    setState("drafting");
    setError(null);
    try {
      const res = await fetch("/api/offer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteId: m.siteId, brief }),
      });
      const data = (await res.json()) as { email?: string; source?: "claude" | "template"; error?: string };
      if (!res.ok || !data.email) throw new Error(data.error ?? "Could not draft the email.");
      setEmail(data.email);
      setSource(data.source ?? null);
      setState("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not draft the email.");
      setState("idle");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: the text stays selectable */
    }
  }

  const press = reduce ? undefined : { scale: 0.97 };
  const pill = "inline-flex min-h-11 items-center rounded-full px-5 text-[0.9375rem] font-semibold outline-none";

  return (
    <div className="w-full max-w-[560px] space-y-4">
      <p className="text-[1.0625rem] leading-[1.5]">{m.summary}</p>
      <div className="flex flex-wrap items-center gap-3">
        {state !== "ready" && (
          <motion.button
            type="button"
            onClick={draft}
            disabled={state === "drafting"}
            whileTap={press}
            transition={{ duration: DUR.press }}
            className={`${pill} h-12 bg-[var(--color-text)] text-[var(--color-stage)] disabled:opacity-80`}
          >
            {state === "drafting" ? "Drafting..." : m.label}
          </motion.button>
        )}
        <a
          href={m.memoHref}
          className={`${pill} border border-[var(--color-line-strong)] bg-[oklch(1_0_0/0.06)] text-[var(--color-text)] hover:bg-[var(--color-stage-3)]`}
        >
          Open deal memo
        </a>
      </div>
      {error && (
        <p role="alert" className="text-sm text-[var(--needed)]">
          {error} Try again.
        </p>
      )}
      <AnimatePresence>
        {state === "ready" && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={reduce ? REDUCED : SPRING.ui}
            className="space-y-3 rounded-[16px] border border-[var(--color-line)] bg-[oklch(1_0_0/0.06)] p-4"
          >
            {source ? <p className="flow-source text-text-3">{source === "claude" ? "Written by Claude from your asks" : "Template filled from your asks (the model was not used)"}</p> : null}
            <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap font-sans text-sm leading-[1.55] text-[var(--color-text)]">{email}</pre>
            <div className="flex items-center gap-3">
              <motion.button
                type="button"
                onClick={copy}
                whileTap={press}
                transition={{ duration: DUR.press }}
                className={`${pill} bg-[var(--color-text)] text-[var(--color-stage)]`}
              >
                {copied ? "Copied" : "Copy email"}
              </motion.button>
              <button type="button" onClick={draft} className="min-h-11 text-sm text-[var(--color-text-2)] underline-offset-4 hover:underline">
                Redraft
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
