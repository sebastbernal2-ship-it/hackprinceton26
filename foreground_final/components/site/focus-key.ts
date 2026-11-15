import type { CostLine } from "@/lib/engine/types";

/** The focus key a cost line shares with its row, its block in the vessel, its lens callout and its tour pin. */
export const lineKey = (l: Pick<CostLine, "id" | "findingId">) => l.findingId ?? `line:${l.id}`;
