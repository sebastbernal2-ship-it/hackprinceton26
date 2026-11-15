import type { Range } from "@/lib/engine/types";
import { STATUS_COLOR } from "./primitives";

type Status = keyof typeof STATUS_COLOR;

/**
 * The signature move: a dollar range drawn as a survey dimension line on a shared scale.
 * Ticks at low and high, a heavier mark at the midpoint.
 */
export function DimensionLine({
  range,
  max,
  status,
  className,
  draw = "reveal",
  index = 0,
}: {
  range: Range;
  max: number;
  status: Status;
  className?: string;
  /** "load": draws on first paint (first viewport); "reveal": draws when its section scrolls in */
  draw?: "load" | "reveal" | "none";
  /** position in its list, for the stagger */
  index?: number;
}) {
  const x = (v: number) => Math.max(0, Math.min(100, (v / max) * 100));
  const lo = x(range.low);
  const hi = Math.max(x(range.high), lo + 0.4);
  const mid = x(range.mid);
  const color = STATUS_COLOR[status];
  return (
    <svg
      viewBox="0 0 100 20"
      preserveAspectRatio="none"
      className={[draw === "load" ? "draw-on-load" : draw === "reveal" ? "dim-draw" : "", className].filter(Boolean).join(" ")}
      style={{ ["--i" as string]: index }}
      width="100%"
      height="20"
      aria-hidden
      focusable="false"
    >
      {/* the span draws low → high; unknown (dashed) spans fade instead, since a dash pattern can't also be a draw */}
      {status === "maybe" ? (
        <line className="dt" x1={lo} x2={hi} y1={10} y2={10} stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeDasharray="5 3" />
      ) : (
        <line className="ds" x1={lo} x2={hi} y1={10} y2={10} stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      )}
      <line className="dt" x1={lo} x2={lo} y1={3} y2={17} stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <line className="dt" x1={hi} x2={hi} y1={3} y2={17} stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <line className="dt" x1={mid} x2={mid} y1={5.5} y2={14.5} stroke={color} strokeWidth={4} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Nice round step for a dollar axis. */
export function niceStep(max: number, target = 4): number {
  const raw = max / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  const step = n < 1.5 ? 1 : n < 3.5 ? 2.5 : n < 7.5 ? 5 : 10;
  return step * pow;
}

export function niceMax(max: number, target = 4): number {
  const step = niceStep(max, target);
  return Math.ceil(max / step) * step;
}
