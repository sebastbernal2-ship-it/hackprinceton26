"use client";

import { num } from "@/lib/format";
import { PlanMini } from "../plan-mini";
import { Fact, Tile } from "../tile";
import type { TileProps } from "./types";

/** "The floor": the plan as it stands (suggested until the owner edits it), seats and area. Opens Layout. */
export function FloorTile({ deal, onOpen, index }: TileProps) {
  const { layout, impact } = deal;
  const area = Math.round(layout.footprint.areaM2 * 10.7639);
  return (
    <Tile title="The floor" source={`Foreground layout engine, ${layout.footprint.source === "matterport" ? "scanned outline" : "listing rectangle"}`} opens="layout" onOpen={onOpen} index={index}>
      <div className="grid min-h-0 flex-1 place-items-center rounded-f-sm bg-stage p-2">
        <PlanMini layout={layout} label={`Floor plan with ${impact.seats} seats`} className="h-full w-full" />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Fact label="Seats">{num(impact.seats)}</Fact>
        <Fact label="Floor">{num(area)} SF</Fact>
        <Fact label="Concept">{layout.concept.replace("-", " ")}</Fact>
      </div>
    </Tile>
  );
}
