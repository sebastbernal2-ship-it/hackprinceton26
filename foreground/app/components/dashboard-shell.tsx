"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { clearBrief } from "../lib/brief";
import { clearMatches } from "../lib/discover";

// Discover covers the intake result, the shortlist and the property view. Profile holds the saved answers,
// reference media and the asset catalog. Chat & Refine stays reachable because nothing else links to it.
const TABS = [
  { href: "/dashboard", label: "Discover" },
  { href: "/dashboard/profile", label: "Profile" },
  { href: "/dashboard/refine", label: "Chat & Refine" },
];

export default function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Desktop minimize. Remembered per browser; the page works without storage.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try { const saved = localStorage.getItem("sidebar-collapsed") === "1"; void Promise.resolve().then(() => setCollapsed(saved)); } catch { /* storage unavailable */ }
  }, []);
  function collapse(next: boolean) {
    setCollapsed(next);
    try { localStorage.setItem("sidebar-collapsed", next ? "1" : "0"); } catch { /* storage unavailable */ }
  }
  const fullBleed = pathname.startsWith("/dashboard/refine");

  return (
    <div className="relative min-h-dvh flex-1 font-sans">
      <button
        type="button"
        onClick={() => { setOpen((current) => !current); collapse(false); }}
        aria-label="Open sidebar"
        aria-expanded={open || !collapsed}
        aria-controls="sidebar"
        className={`fixed left-4 top-4 z-30 h-9 w-9 items-center justify-center rounded-lg text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground flex ${collapsed ? "md:flex" : "md:hidden"}`}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <rect x="2.75" y="3.75" width="14.5" height="12.5" rx="2.5" />
          <path d="M7.75 3.75v12.5" />
        </svg>
      </button>

      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-10 bg-foreground/20 transition-opacity md:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />

      <aside
        id="sidebar"
        aria-label="Sidebar"
        className={`fixed inset-y-0 left-0 z-20 flex w-56 flex-col border-r border-foreground/10 bg-panel px-4 pb-6 pt-6 transition-transform duration-300 ${collapsed ? "md:-translate-x-full" : "md:translate-x-0"} ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        inert={collapsed && !open ? true : undefined}
      >
        <div className="flex items-center justify-between px-3">
          <span className="text-sm font-medium tracking-tight">Foreground</span>
          <button
            type="button"
            onClick={() => { setOpen(false); collapse(true); }}
            aria-label="Minimize sidebar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground/50 transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <rect x="2.75" y="3.75" width="14.5" height="12.5" rx="2.5" />
              <path d="M7.75 3.75v12.5" />
            </svg>
          </button>
        </div>
        <nav aria-label="Dashboard" className="mt-8">
          <ul className="flex flex-col gap-1">
            {TABS.map((tab) => {
              const current = pathname === tab.href;
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    onClick={() => setOpen(false)}
                    aria-current={current ? "page" : undefined}
                    className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                      current ? "bg-foreground/5 font-medium" : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="mt-auto">
          <Link
            href="/"
            onClick={() => { clearBrief(); clearMatches(); }}
            className="block rounded-lg px-3 py-2 text-sm text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            Start over
          </Link>
        </div>
      </aside>

      <div className={collapsed ? "" : "md:pl-56"}>
        {fullBleed ? children : <main className="mx-auto w-full max-w-6xl px-6 pb-16 pt-16 md:px-10 md:pt-16">{children}</main>}
      </div>
    </div>
  );
}
