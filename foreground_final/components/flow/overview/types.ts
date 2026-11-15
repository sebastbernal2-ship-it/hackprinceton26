import type { Chapter } from "../chapter-model";
import type { DealValue } from "../deal-context";

export type TileProps = { deal: DealValue; onOpen: (c: Chapter) => void; index: number };
