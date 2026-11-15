"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { Panel } from "./geo";

const SPRING = { type: "spring", stiffness: 170, damping: 26 } as const;

/**
 * One city drawn as a surveyor's plat: graticule, traverse legs between the sites, and each site as a monument.
 * `lit` sites brighten as the owner types; `focus` eases the camera toward this city on submit.
 */
export function CityPlat({
  panel,
  lit,
  typing,
  focus,
  intro = true,
  className,
}: {
  intro?: boolean;
  panel: Panel;
  lit: Set<string>;
  typing: boolean;
  focus: "none" | "in" | "out";
  className?: string;
}) {
  const still = !intro;
  const W = panel.w;
  const H = panel.h;
  return (
    <motion.div
      className={cn("relative w-full", className)}
      style={{ aspectRatio: `${W} / ${H}` }}
      initial={false}
      animate={still ? { opacity: focus === "out" ? 0.35 : 1 } : { scale: focus === "in" ? 1.18 : 1, opacity: focus === "out" ? 0.25 : 1 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full overflow-visible" role="group" aria-label={`${panel.city}: ${panel.sites.length} spaces`}>
        {/* graticule, breathing slowly */}
        <g className="plat-breathe" stroke="var(--on-ink)" strokeOpacity={0.12} strokeWidth={1} vectorEffect="non-scaling-stroke">
          {panel.meridians.map((m, i) => (
            <line key={`m${i}`} x1={m.x} x2={m.x} y1={0} y2={H} />
          ))}
          {panel.parallels.map((p, i) => (
            <line key={`p${i}`} x1={0} x2={W} y1={p.y} y2={p.y} />
          ))}
        </g>
        <g fill="var(--on-ink-2)" fontFamily="var(--font-geist-mono)" fontSize={9} opacity={0.6} aria-hidden>
          {panel.meridians.filter((_, i) => i % 2 === 0).map((m, i) => (
            <text key={`ml${i}`} x={m.x + 3} y={H - 6}>
              {m.label}
            </text>
          ))}
          {panel.parallels.filter((_, i) => i % 2 === 0).map((p, i) => (
            <text key={`pl${i}`} x={4} y={p.y - 3}>
              {p.label}
            </text>
          ))}
        </g>

        {/* traverse legs, drawn in on load */}
        <g aria-hidden>
          {panel.legs.map((l, i) => {
            const mx = (l.a.x + l.b.x) / 2;
            const my = (l.a.y + l.b.y) / 2;
            const ang = (Math.atan2(l.b.y - l.a.y, l.b.x - l.a.x) * 180) / Math.PI;
            const upright = ang > 90 || ang < -90 ? ang + 180 : ang;
            const long = Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y) > 110;
            return (
              <g key={i}>
                <motion.line
                  x1={l.a.x}
                  y1={l.a.y}
                  x2={l.b.x}
                  y2={l.b.y}
                  stroke="var(--on-ink)"
                  strokeOpacity={0.35}
                  strokeWidth={1}
                  strokeDasharray="6 4"
                  initial={still ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.1, delay: 0.25 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
                />
                {long ? (
                <text
                  x={mx}
                  y={my}
                  dy={-5}
                  textAnchor="middle"
                  transform={`rotate(${upright.toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)})`}
                  fontFamily="var(--font-geist-mono)"
                  fontSize={9}
                  fill="var(--on-ink-2)"
                  opacity={0.7}
                >
                  {l.label}
                </text>
                ) : null}
              </g>
            );
          })}
        </g>

        {/* monuments */}
        {panel.sites.map((s, i) => {
          const on = !typing || lit.has(s.id);
          const left = s.x > W * 0.6;
          return (
            <Link key={s.id} href={`/site/${s.id}`} aria-label={`${s.address}${s.suite ? `, Suite ${s.suite}` : ""}, ${s.city}`} className="group outline-none">
              <motion.g
                initial={still ? false : { opacity: 0, scale: 0.4 }}
                animate={{ opacity: on ? 1 : 0.28, scale: 1 }}
                transition={{ ...SPRING, delay: still || typing ? 0 : 0.4 + i * 0.08 }}
                style={{ transformOrigin: `${s.x}px ${s.y}px`, transformBox: "view-box" }}
              >
                <circle cx={s.x} cy={s.y} r={16} fill="transparent" />
                <motion.circle
                  cx={s.x}
                  cy={s.y}
                  fill="none"
                  stroke={typing && on ? "var(--maybe)" : "var(--on-ink)"}
                  strokeWidth={1.25}
                  initial={false}
                  animate={{ r: typing && on ? 11 : 6.5 }}
                  transition={SPRING}
                />
                <line x1={s.x - 12} x2={s.x + 12} y1={s.y} y2={s.y} stroke="var(--on-ink)" strokeWidth={1} />
                <line x1={s.x} x2={s.x} y1={s.y - 12} y2={s.y + 12} stroke="var(--on-ink)" strokeWidth={1} />
                <circle cx={s.x} cy={s.y} r={1.8} fill={typing && on ? "var(--maybe)" : "var(--on-ink)"} />
                <text
                  x={left ? s.x - 16 : s.x + 16}
                  y={s.y - 6}
                  textAnchor={left ? "end" : "start"}
                  fontFamily="var(--font-geist-mono)"
                  fontSize={11}
                  fill="var(--on-ink)"
                  className="transition-[text-decoration] group-hover:underline group-focus-visible:underline"
                >
                  {s.address}
                </text>
                <text x={left ? s.x - 16 : s.x + 16} y={s.y + 8} textAnchor={left ? "end" : "start"} fontFamily="var(--font-geist-mono)" fontSize={9} fill="var(--on-ink-2)">
                  {Math.round(s.sf).toLocaleString("en-US")} SF{s.rentPerSfYr != null ? ` · $${s.rentPerSfYr}/SF` : ""}
                </text>
                <rect
                  x={s.x - 18}
                  y={s.y - 18}
                  width={36}
                  height={36}
                  fill="none"
                  stroke="var(--ring)"
                  strokeWidth={2}
                  className="opacity-0 group-focus-visible:opacity-100"
                />
              </motion.g>
            </Link>
          );
        })}
      </svg>
      <p className="lettering-wide pointer-events-none absolute top-2 left-0 text-[0.6875rem] font-bold text-on-ink-2">
        {panel.city} · {panel.center.lat.toFixed(2)}°N
      </p>
    </motion.div>
  );
}
