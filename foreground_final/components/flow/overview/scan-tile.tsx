"use client";

import { useMemo } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { walkable } from "@/lib/immersive/walk";
import { Fact, NotInData, Tile } from "../tile";
import type { TileProps } from "./types";
import { num } from "@/lib/format";

/** "The scan": the first walkable pano drifting slowly, the room count, the area, and whether it is this suite. */
export function ScanTile({ deal, onOpen, index }: TileProps) {
  const reduce = useReducedMotion();
  const mp = deal.site.matterport;
  const pano = useMemo(() => (mp ? walkable(mp.panos)[0] : undefined), [mp]);
  const face = pano?.skybox?.[1];
  if (!mp || !pano || !face) {
    return (
      <Tile title="The scan" source="Matterport" opens="walk" onOpen={onOpen} index={index}>
        <NotInData what="3D scan" />
      </Tile>
    );
  }
  return (
    <Tile title="The scan" source={`Matterport${mp.scanName ? `, ${mp.scanName}` : ""}`} opens="walk" onOpen={onOpen} index={index}>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-f-sm bg-stage">
        <motion.div
          className="absolute inset-0"
          initial={false}
          animate={reduce ? undefined : { scale: [1.08, 1.22, 1.08], x: ["-3%", "3%", "-3%"] }}
          transition={{ duration: 24, ease: "linear", repeat: Infinity }}
        >
          <Image src={face} alt="Inside the scanned space" fill sizes="320px" className="object-cover" />
        </motion.div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Fact label="Rooms">{num(mp.rooms.length)}</Fact>
        <Fact label="Scanned">{mp.areaSf ? `${num(mp.areaSf)} SF` : <NotInData />}</Fact>
        <Fact label="Is this suite">{mp.scanOfExactSuite ? "Exact suite" : "Same building"}</Fact>
      </div>
    </Tile>
  );
}
