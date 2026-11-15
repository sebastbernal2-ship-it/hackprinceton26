"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type RailItem = { id: string; label: string };

/** Sticky section navigation; marks the last section whose top has passed under the rail. */
export function SectionRail({ items }: { items: RailItem[] }) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      let current = items[0]?.id;
      for (const i of items) {
        const el = document.getElementById(i.id);
        if (el && el.getBoundingClientRect().top <= 140) current = i.id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [items]);

  return (
    <nav aria-label="Sections" className="sticky top-0 z-20 border-b border-rule-strong bg-paper/95 backdrop-blur-sm supports-[backdrop-filter]:bg-paper/85">
      <ul className="mx-auto flex max-w-[90rem] gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:px-8">
        {items.map((i) => (
          <li key={i.id} className="shrink-0">
            <a
              href={`#${i.id}`}
              aria-current={active === i.id ? "location" : undefined}
              className={cn(
                "relative flex h-12 items-center px-3 text-sm font-medium text-ink-2 transition-colors hover:text-ink",
                active === i.id && "text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-ink",
              )}
            >
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
