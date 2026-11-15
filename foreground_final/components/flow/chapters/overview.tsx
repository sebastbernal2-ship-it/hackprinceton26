"use client";

import { useDeal } from "../deal-context";
import { AerialTile } from "../overview/aerial-tile";
import { BlockTile } from "../overview/block-tile";
import { FloorTile } from "../overview/floor-tile";
import { HistoryTile } from "../overview/history-tile";
import { MoneyTile } from "../overview/money-tile";
import { RentTile } from "../overview/rent-tile";
import { ScanTile } from "../overview/scan-tile";
import { ChapterFrame } from "./chapter-frame";
import type { ChapterProps } from "./types";

/** Chapter 1: the whole site on one screen. Seven tiles, each a button into its chapter. */
export function OverviewChapter({ status, onRetry, onChapter }: ChapterProps) {
  const deal = useDeal();
  if (!deal) {
    return (
      <ChapterFrame step={1} title="Overview" lede="Reading the site: aerial, scan, rent, tenants and costs." will={[]} live={null} status={status} onRetry={onRetry} />
    );
  }
  return (
    <section aria-label="Overview of the space" className="pointer-events-none grid h-full min-h-0 grid-cols-3 gap-3 pt-14 [grid-template-rows:minmax(0,1fr)_minmax(0,1fr)_auto]">
      <AerialTile deal={deal} onOpen={onChapter} index={0} />
      <ScanTile deal={deal} onOpen={onChapter} index={1} />
      <FloorTile deal={deal} onOpen={onChapter} index={2} />
      <MoneyTile deal={deal} onOpen={onChapter} index={3} />
      <RentTile deal={deal} onOpen={onChapter} index={4} />
      <HistoryTile deal={deal} onOpen={onChapter} index={5} />
      <BlockTile deal={deal} onOpen={onChapter} index={6} className="col-span-3 h-[148px]" />
    </section>
  );
}
