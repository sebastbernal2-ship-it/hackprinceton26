"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
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
  const fullBleed = pathname.startsWith("/dashboard/refine");

  return (
    <div className="relative min-h-dvh flex-1 font-sans">
      <header className="sticky top-0 z-30 border-b border-foreground/10 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-[86rem] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 md:px-10">
          <span className="hidden text-sm font-medium tracking-tight sm:inline">Foreground</span>
          <nav aria-label="Dashboard" className="flex min-w-0 flex-1 items-center gap-1">
            {TABS.map((tab) => {
              const current = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={current ? "page" : undefined}
                  className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                    current ? "bg-foreground/5 font-medium" : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
          <Link
            href="/"
            onClick={() => { clearBrief(); clearMatches(); }}
            className="rounded-lg px-3 py-2 text-sm text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            Start over
          </Link>
        </div>
      </header>
      {fullBleed ? children : <main className="mx-auto w-full max-w-[86rem] px-4 pb-16 pt-8 md:px-10">{children}</main>}
    </div>
  );
}
