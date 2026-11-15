"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { layerOf } from "@/components/site/aerial";
import { monthYear, num, sf } from "@/lib/format";
import { DUR, EASE } from "../motion";
import { Fact, NotInData, Tile } from "../tile";
import type { TileProps } from "./types";

/** "From above": the Vexcel ortho with its detections drawn in (pathLength), hover swaps to the oblique. */
export function AerialTile({ deal, onOpen, index }: TileProps) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState(false);
  const a = deal.site.aerial;
  if (!a) {
    return (
      <Tile title="From above" source="Vexcel aerial" opens="walk" onOpen={onOpen} index={index}>
        <NotInData what="Aerial view" />
      </Tile>
    );
  }
  const w = a.widthPx;
  const h = a.heightPx;
  const drawn = a.detections.filter((d) => layerOf(d.label) !== "other" && d.polygon.length > 2);
  return (
    <Tile title="From above" source={`Vexcel aerial${a.captureDate ? `, ${monthYear(a.captureDate)}` : ""}`} opens="walk" onOpen={onOpen} index={index}>
      <div
        className="relative min-h-0 flex-1 overflow-hidden rounded-f-sm bg-stage"
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
      >
        <Image src={a.orthoPath} alt="Aerial view looking straight down at the building and its lot" fill sizes="320px" className="object-cover" />
        {a.obliquePath ? (
          <motion.div className="absolute inset-0" initial={false} animate={{ opacity: hover ? 1 : 0 }} transition={{ duration: DUR.state }}>
            <Image src={a.obliquePath} alt="Angled aerial view of the building and street" fill sizes="320px" className="object-cover" />
          </motion.div>
        ) : null}
        {w && h ? (
          <motion.svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden initial={false} animate={{ opacity: hover ? 0 : 1 }} transition={{ duration: DUR.state }}>
            {drawn.map((d, i) => (
              <motion.polygon
                key={i}
                points={d.polygon.map(([x, y]) => `${x},${y}`).join(" ")}
                fill="oklch(0.82 0.09 235 / 0.16)"
                stroke="oklch(0.82 0.09 235)"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                initial={reduce ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: DUR.draw, ease: EASE.out, delay: 0.4 + i * 0.08 }}
              />
            ))}
          </motion.svg>
        ) : null}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Fact label="Parking">{a.parkingSpaces != null ? num(a.parkingSpaces) : <NotInData />}</Fact>
        <Fact label="Patio room">{a.patioCandidateSf ? sf(a.patioCandidateSf) : <NotInData />}</Fact>
        <Fact label="Captured">{a.captureDate ? monthYear(a.captureDate) : <NotInData />}</Fact>
      </div>
    </Tile>
  );
}
