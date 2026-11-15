"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Phase = "static" | "armed" | "shown";

/**
 * A section that surveys itself in when it scrolls into view: the opening ink rule draws from the left like a chain
 * being pulled, the title settles, and every dimension line inside draws (CSS in site-motion.css keys off
 * data-reveal). Content is visible in the server HTML; only sections below the fold at mount are armed, so nothing
 * on screen ever blinks out, and a failed script leaves the page whole.
 */
export function RevealSection({
  id,
  labelledBy,
  className,
  children,
}: {
  id: string;
  labelledBy: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [phase, setPhase] = useState<Phase>("static");

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return; // already on screen: leave it be
    // arming hides below-the-fold content before it can be seen; the observer reveals it on arrival
    setPhase("armed");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setPhase("shown");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    io.observe(el);
    // A jump link (rail, #hash) lands mid-page: reveal whatever it lands on at once.
    const onHash = () => {
      if (el.getBoundingClientRect().top < window.innerHeight) setPhase("shown");
    };
    window.addEventListener("hashchange", onHash);
    return () => {
      io.disconnect();
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  return (
    <section ref={ref} id={id} aria-labelledby={labelledBy} data-reveal={phase} className={cn("survey-section relative", className)}>
      <span aria-hidden className="survey-rule" />
      {children}
    </section>
  );
}
