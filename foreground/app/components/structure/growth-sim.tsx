"use client";

import { useEffect, useRef, useState } from "react";
import { money } from "../../lib/costs";
import { postExpansion, SAMPLE_PLAN, type ExpansionResponse } from "../../lib/structure";
import {
  fmtK, fmtRange, net, PERSON_COLORS, seatsForStage, SEAT_DX, spawn, spawnRate, staticCrowd, STAGES, step, TABLES,
  type Person, type Range,
} from "../../lib/growth-sim";
import Badge from "../reskin/badge";

const STAGE_SECONDS = 5;
const REV_MAX = 120000;
const INK = "#1b1a17", PAPER = "#f4f1ea", ACCENT = "#d9512c", OLIVE = "#5f6d4e";

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return reduced;
}

const fade = (on: boolean): React.CSSProperties => ({ opacity: on ? 1 : 0, transition: "opacity 700ms ease, transform 700ms ease", transform: on ? "none" : "translateY(6px)", pointerEvents: "none" });

function Table({ at }: { at: [number, number] }) {
  const [x, y] = at;
  return (
    <g>
      {[-SEAT_DX, SEAT_DX].map((dx) => <rect key={dx} x={x + dx - 6} y={y - 7} width={12} height={14} rx={4} fill="#d8cfbf" />)}
      <circle cx={x} cy={y} r={12} fill="#fbf9f4" stroke="#bfb6a5" />
      <circle cx={x + 2} cy={y - 2} r={2.6} fill="#a07a4f" />
    </g>
  );
}

function Counter({ x, w, y }: { x: number; w: number; y: number }) {
  const mx = x + w / 2;
  return (
    <g>
      <rect x={x} y={y} width={w} height={22} rx={5} fill="#a07a4f" />
      <rect x={x + 4} y={y + 3} width={w - 8} height={6} rx={3} fill="#c4a173" />
      <rect x={mx - 10} y={y + 9} width={20} height={9} rx={2} fill={INK} />
      {[-5, 0, 5].map((d, i) => <path key={d} className="gs-steam" style={{ animationDelay: `${i * 0.5}s` }} d={`M${mx + d} ${y + 6} q-3 -6 0 -11 t0 -11`} fill="none" stroke="#fff" strokeOpacity={0.9} strokeWidth={1.6} strokeLinecap="round" />)}
    </g>
  );
}

function Guest({ p, t }: { p: Person; t: number }) {
  const bob = p.walking ? Math.sin(t * 14 + p.id) * 1.2 : 0;
  const c = PERSON_COLORS[p.color];
  return (
    <g transform={`translate(${p.x.toFixed(1)} ${(p.y + bob).toFixed(1)}) scale(1.3)`}>
      <ellipse cx={0} cy={5} rx={6} ry={2.4} fill={INK} opacity={0.15} />
      <ellipse cx={0} cy={1.5} rx={5.2} ry={4} fill={c} />
      <circle cx={0} cy={-3.2} r={3.7} fill="#e6c9a8" stroke={INK} strokeOpacity={0.25} strokeWidth={0.6} />
    </g>
  );
}

function Scene({ stage, people, t, label }: { stage: number; people: Person[]; t: number; label: string }) {
  const seated = people.filter((p) => p.phase === "sit" && p.seat).length;
  return (
    <svg viewBox="0 0 760 350" role="img" aria-label={`Illustrated cafe at stage ${stage + 1} of 4: ${label}. ${seated} guests seated.`} className="w-full rounded-xl" style={{ background: PAPER }}>
      <style>{`
        .gs-steam{animation:gs-steam 2.4s ease-out infinite;transform-box:fill-box}
        @keyframes gs-steam{0%{opacity:0;transform:translateY(2px)}25%{opacity:.9}100%{opacity:0;transform:translateY(-12px)}}
        @media (prefers-reduced-motion: reduce){.gs-steam{animation:none;opacity:0}}
      `}</style>
      {/* street */}
      <rect x={0} y={296} width={760} height={54} fill="#d9d2c3" />
      <line x1={0} y1={326} x2={760} y2={326} stroke={PAPER} strokeWidth={2} strokeDasharray="14 12" opacity={0.8} />

      {/* patio (stage 1+) */}
      <g style={fade(stage >= 1)}>
        <rect x={22} y={128} width={146} height={162} rx={6} fill="#e7e2d3" stroke="#8d9a79" strokeWidth={2} strokeDasharray="5 4" />
        {[[40, 138], [100, 138], [150, 138]].map(([x, y]) => <circle key={x} cx={x} cy={y} r={7} fill={OLIVE} opacity={0.75} />)}
        {TABLES.patio.map((a) => <Table key={a.join()} at={a} />)}
        {TABLES.patio.map(([x, y]) => <path key={`u${x}${y}`} d={`M${x - 22} ${y - 14} a22 12 0 0 1 44 0z`} fill={ACCENT} opacity={0.18} />)}
        <text x={95} y={118} textAnchor="middle" fontSize={11} fill={INK} opacity={0.55}>Patio</text>
      </g>

      {/* main cafe */}
      <rect x={170} y={50} width={210} height={240} fill="#f9f6ee" />
      <Counter x={190} w={170} y={62} />
      {TABLES.cafe.map((a) => <Table key={a.join()} at={a} />)}
      <text x={275} y={42} textAnchor="middle" fontSize={12} fontWeight={600} fill={INK}>Your cafe</text>

      {/* suite B */}
      <rect x={380} y={50} width={150} height={240} fill={stage >= 2 ? "#f9f6ee" : "#ebe6da"} style={{ transition: "fill 700ms" }} />
      <g style={fade(stage >= 2)}>{TABLES.suite.map((a) => <Table key={a.join()} at={a} />)}</g>
      <text x={455} y={42} textAnchor="middle" fontSize={11} fill={INK} opacity={0.6}>{stage >= 2 ? "Suite B, now open" : "Suite B (vacant)"}</text>
      {stage < 2 && <text x={455} y={175} textAnchor="middle" fontSize={11} fill={INK} opacity={0.35}>next door</text>}

      {/* second location (stage 3) */}
      <g style={fade(stage >= 3)}>
        <rect x={560} y={100} width={180} height={190} fill="#f9f6ee" />
        <Counter x={575} w={150} y={112} />
        {TABLES.second.map((a) => <Table key={a.join()} at={a} />)}
        <text x={650} y={92} textAnchor="middle" fontSize={12} fontWeight={600} fill={INK}>Location 2</text>
        <path d="M560 290 H630 M670 290 H740" stroke={INK} strokeWidth={4} />
        <rect x={628} y={284} width={44} height={6} fill={ACCENT} opacity={0.5} />
        <rect x={558} y={98} width={184} height={194} fill="none" stroke={INK} strokeWidth={4} rx={2} />
      </g>

      {/* walls: main cafe outline, shared wall with a removable section, suite outline */}
      <path d="M170 290 H255 M295 290 H530 V50 H170 V290" fill="none" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
      <path d="M380 50 V160 M380 220 V290" stroke={INK} strokeWidth={4} />
      <line x1={380} y1={160} x2={380} y2={220} stroke={INK} strokeWidth={4} style={{ opacity: stage >= 2 ? 0 : 1, transition: "opacity 700ms" }} />
      {stage >= 2 && <text x={455} y={282} textAnchor="middle" fontSize={9} fill={ACCENT}>wall opening: engineer to verify</text>}
      {/* door + awning */}
      <rect x={252} y={286} width={46} height={8} rx={2} fill={ACCENT} opacity={0.85} />

      {people.map((p) => <Guest key={p.id} p={p} t={t} />)}

      <g transform="translate(14 22)">
        <rect width={196} height={20} rx={10} fill={INK} opacity={0.9} />
        <text x={12} y={14} fontSize={11} fill={PAPER}>Month {STAGES[stage].month}  ·  {label}</text>
      </g>
    </svg>
  );
}

function RangeBar({ label, r, color, scale = REV_MAX, hint }: { label: string; r: Range; color: string; scale?: number; hint?: string }) {
  const left = (r.low / scale) * 100, width = ((r.high - r.low) / scale) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm"><span>{label}</span><span className="tabular-nums font-medium">{fmtRange(r)}</span></div>
      <div className="relative mt-1 h-2.5 rounded-full bg-foreground/10" aria-hidden>
        <div className="absolute top-0 h-2.5 rounded-full" style={{ left: `${left}%`, width: `${Math.max(width, 1.5)}%`, background: color, transition: "left 600ms ease, width 600ms ease" }} />
      </div>
      {hint && <p className="mt-0.5 text-xs text-foreground/45">{hint}</p>}
    </div>
  );
}

function Stat({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-foreground/[0.04] px-3 py-2">
      <p className="text-xs text-foreground/50">{k}</p>
      <p className="text-lg font-medium tabular-nums tracking-tight">{v}</p>
      {sub && <p className="text-xs text-foreground/45">{sub}</p>}
    </div>
  );
}

const rangeText = (r: { low: number | null; expected: number | null; high: number | null }) =>
  r.expected === null ? "Unknown" : `${money(r.low)} / ${money(r.expected)} / ${money(r.high)}`;

function EngineDetail({ listingId }: { listingId: number }) {
  const [res, setRes] = useState<ExpansionResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true); setErr(null);
    try { setRes(await postExpansion(listingId, SAMPLE_PLAN, ["a"])); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="mt-5 border-t border-foreground/10 pt-4">
      <p className="text-sm text-foreground/60">Want the underlying scenario engine? It prices phases and flags shared walls, but this property&apos;s floor plan is not loaded, so it runs on an <strong>illustrative sample plan, not this property</strong>.</p>
      <button type="button" onClick={run} disabled={busy} className="mt-2 rounded-full border border-foreground/20 px-4 py-1.5 text-sm font-medium disabled:opacity-40">{busy ? "Running." : "Run engine on sample plan"}</button>
      {err && <p className="mt-2 text-sm text-accent" role="alert">{err}</p>}
      {res && (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <ul className="space-y-2 text-sm">
            {res.expansion.candidates.map((c) => (
              <li key={c.roomId} className="rounded-lg border border-foreground/10 p-2.5">
                <p><strong>{c.label}</strong> adds {c.areaSqFtGained} sq ft <Badge kind="estimated">wall hint</Badge></p>
                <p className="text-foreground/70">{c.openingDifficultyHint}</p>
                <p className="mt-1 text-xs text-foreground/50">Verify with engineer: {c.verifyWithEngineer.join(" | ")}</p>
              </li>
            ))}
          </ul>
          <ol className="space-y-2 text-sm" aria-label="Capex timeline">
            {res.timeline.phases.map((p) => (
              <li key={p.phase}>
                <div className="flex justify-between gap-3"><span>{p.label} <span className="text-foreground/50">(month {p.monthOffset}, {p.monthOffsetStatus})</span></span><span className="tabular-nums">{rangeText(p.capex)}</span></div>
                {p.unknownCostItems.length > 0 && <p className="text-xs text-foreground/50">Unknown cost items, excluded not zero: {p.unknownCostItems.join(", ")}</p>}
              </li>
            ))}
            <li className="text-xs text-foreground/50">Cumulative expected cost of priced items only ({res.timeline.cumulativeStatus}). {res.expansion.notice}</li>
          </ol>
        </div>
      )}
    </div>
  );
}

export default function GrowthSim({ listingId, title = "How this space could grow" }: { listingId?: number; title?: string }) {
  const reduced = useReducedMotion();
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [clock, setClock] = useState(0);
  const sim = useRef({ people: [] as Person[], stage: 0, acc: 0, nextId: 1, t: 0, playT: 0, playing: false });
  useEffect(() => { sim.current.stage = stage; sim.current.playing = playing; }, [stage, playing]);

  // Reduced motion: a still, half-full room that follows the slider.
  const shown = reduced ? staticCrowd(stage) : people;

  useEffect(() => {
    if (reduced) return;
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const s = sim.current;
      s.t += dt;
      if (s.playing) {
        s.playT += dt;
        const next = Math.min(STAGES.length - 1, Math.floor(s.playT / STAGE_SECONDS));
        if (next !== s.stage) { s.stage = next; setStage(next); }
        if (s.playT >= STAGE_SECONDS * (STAGES.length - 1) + STAGE_SECONDS * 1.2) { s.playing = false; setPlaying(false); }
      }
      s.acc += dt * spawnRate(s.stage);
      let list = s.people;
      while (s.acc >= 1) { s.acc -= 1; const p = spawn(list, s.stage, s.nextId++, Math.random); if (p) list = [...list, p]; }
      s.people = step(list, dt, s.stage, Math.random);
      setPeople(s.people);
      setClock(s.t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  const st = STAGES[stage];
  const total = seatsForStage(stage).length;
  const seated = shown.filter((p) => p.phase === "sit" && p.seat).length;
  const inside = shown.length;
  const n = net(st);

  function pick(i: number) { setPlaying(false); sim.current.playT = i * STAGE_SECONDS; setStage(i); }
  function toggle() {
    if (playing) { setPlaying(false); return; }
    const from = stage >= STAGES.length - 1 ? 0 : stage;
    sim.current.playT = from * STAGE_SECONDS; setStage(from); setPlaying(true);
  }

  return (
    <section className="mt-6 rounded-[1.5rem] border border-foreground/12 bg-panel/50 p-4 sm:p-5" aria-labelledby="growth-title" data-testid="growth-sim">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="growth-title" className="text-lg font-medium tracking-tight">{title}</h2>
          <p className="mt-1 max-w-xl text-sm text-foreground/60">A little model of one café growing in four steps. Press play or drag the timeline and watch seats, footfall and money change.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5"><Badge kind="estimated">demo numbers</Badge><Badge kind="unverified">scenario, not a forecast</Badge></div>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div>
          <Scene stage={stage} people={shown} t={clock} label={st.label} />
          <div className="mt-3 flex items-center gap-3">
            <button type="button" onClick={toggle} disabled={reduced} className="inline-flex h-9 min-w-[5.5rem] items-center justify-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-medium text-background disabled:opacity-40" aria-label={playing ? "Pause growth simulation" : "Play growth simulation"}>
              <span aria-hidden>{playing ? "❚❚" : "▶"}</span> {playing ? "Pause" : stage >= STAGES.length - 1 ? "Replay" : "Play"}
            </button>
            <input type="range" min={0} max={STAGES.length - 1} step={1} value={stage} onChange={(e) => pick(Number(e.target.value))}
              aria-label="Growth timeline" aria-valuetext={`Month ${st.month}: ${st.label}`} className="min-w-0 flex-1 accent-[var(--accent)]" />
          </div>
          <ol className="mt-2 grid grid-cols-4 gap-1 text-center text-xs">
            {STAGES.map((s, i) => (
              <li key={s.id}>
                <button type="button" onClick={() => pick(i)} aria-current={i === stage ? "step" : undefined} className={`w-full rounded-lg px-1 py-1.5 leading-tight transition-colors ${i === stage ? "bg-foreground text-background" : i < stage ? "bg-foreground/10 text-foreground/80" : "text-foreground/50 hover:bg-foreground/5"}`}>
                  <span className="block font-medium">{s.label}</span><span className="block opacity-70">month {s.month}</span>
                </button>
              </li>
            ))}
          </ol>
          {reduced && <p className="mt-2 text-xs text-foreground/50">Motion is reduced on this device, so guests are shown seated. Use the timeline to step through.</p>}
        </div>

        <div className="space-y-3">
          <p className="text-sm text-foreground/70"><strong className="font-medium text-foreground">Month {st.month}, {st.label}.</strong> {st.blurb}</p>
          <div className="grid grid-cols-3 gap-2">
            <Stat k="Seats" v={`${seated}/${total}`} sub="filled now" />
            <Stat k="In the shop" v={String(inside)} sub="guests live" />
            <Stat k="Visits per day" v={`${st.footfall.low}-${st.footfall.high}`} sub="estimated" />
          </div>
          <RangeBar label="Revenue per month" r={st.revenue} color={OLIVE} />
          <RangeBar label="Running cost per month" r={st.cost} color={ACCENT} />
          <div className="flex items-baseline justify-between gap-3 border-t border-foreground/10 pt-2 text-sm">
            <span>Left after running costs</span>
            <span className="tabular-nums font-medium">{fmtK(n.low)} to {fmtK(n.high)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-foreground/70">Build-out this step (one-time)</span>
            <span className="tabular-nums">{fmtRange(st.capex)}</span>
          </div>
          <p className="text-xs leading-relaxed text-foreground/45">Illustrative ranges for a small café, not this property&apos;s data and not a forecast. Guests are drawn at random; real footfall depends on location, hours and rent. &quot;Left after running costs&quot; is before loans and owner pay, and can be negative.</p>
        </div>
      </div>
      {listingId !== undefined && <EngineDetail listingId={listingId} />}
    </section>
  );
}
