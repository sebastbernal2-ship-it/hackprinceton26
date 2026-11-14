"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { clearBrief, useBrief } from "../lib/brief";
import { clearMatches } from "../lib/discover";

const TABS = [
  { href: "/dashboard", label: "Discover" },
  { href: "/dashboard/refine", label: "Chat & Refine" },
];

const SLIDE = "duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]";

export default function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const brief = useBrief();
  // Closed by default so the current tab owns the screen. The toggle slides the nav in when needed.
  const [open, setOpen] = useState(false);
  const fullBleed = pathname.startsWith("/dashboard/refine");

  function startOver() {
    clearBrief();
    clearMatches();
  }

  function go(href: string) {
    setOpen(false);
    if (href !== pathname) router.push(href);
  }

  return (
    <div className="relative min-h-dvh flex-1 font-sans">
      <div className="fixed left-4 top-4 z-30 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-label={open ? "Close sidebar" : "Open sidebar"}
          aria-expanded={open}
          aria-controls="sidebar"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <rect x="2.75" y="3.75" width="14.5" height="12.5" rx="2.5" />
            <path d="M7.75 3.75v12.5" />
          </svg>
        </button>
        <span className="text-sm font-medium tracking-tight">Foreground</span>
      </div>

      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-10 bg-foreground/20 transition-opacity md:hidden ${SLIDE} ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        id="sidebar"
        aria-label="Sidebar"
        inert={!open}
        className={`fixed inset-y-0 left-0 z-20 flex w-64 flex-col overflow-y-auto border-r border-foreground/10 bg-panel px-4 pb-6 pt-20 transition-transform ${SLIDE} ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <nav aria-label="Dashboard">
          <ul className="flex flex-col gap-1">
            {TABS.map((tab) => {
              const current = pathname === tab.href;
              return (
                <li key={tab.href}>
                  <button
                    type="button"
                    onClick={() => go(tab.href)}
                    aria-current={current ? "page" : undefined}
                    className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      current ? "bg-foreground/5 font-medium" : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {brief.length > 0 && (
          <section className="mt-10 px-3" aria-labelledby="brief-heading">
            <h2 id="brief-heading" className="text-xs text-foreground/40">
              Your brief
            </h2>
            <dl className="mt-3 flex flex-col gap-4 text-sm">
              {brief.map((exchange) => (
                <div key={`${exchange.question}:${exchange.answer}`}>
                  <dt className="text-foreground/40">{exchange.question}</dt>
                  <dd className="mt-0.5 break-words">{exchange.answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <div className="mt-auto pt-10">
          <Link
            href="/"
            onClick={startOver}
            className="block rounded-lg px-3 py-2 text-sm text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            Start over
          </Link>
        </div>
      </aside>

      <div className={`transition-[padding] ${SLIDE} ${open ? "md:pl-64" : ""}`}>
        {fullBleed ? children : <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-24 md:px-10">{children}</main>}
      </div>
    </div>
  );
}
