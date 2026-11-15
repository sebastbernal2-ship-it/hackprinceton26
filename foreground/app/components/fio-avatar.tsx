import { FioFigure } from "./fio-character";
import type { Pose } from "../lib/fio-steps";

const STILL: Pose = { x: 0, y: 0, facing: "d", action: "idle", phase: 0, clock: 0, carry: null, say: null, aim: null, pop: null, seg: -1 };

/** Fio's head and shoulders as a round avatar (chat headers, buttons). */
export default function FioAvatar({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-panel ${className}`} style={{ width: size, height: size }} aria-hidden data-testid="fio-avatar">
      <svg viewBox="-30 -102 60 60" width={size} height={size}><FioFigure pose={STILL} reduced /></svg>
    </span>
  );
}
