/**
 * Layout Studio logic. Pure TypeScript with no Node or DOM imports, so it runs in the browser and in tests.
 */
export * from "./types";
export * from "./geometry";
export { autoLayout, footprintFor, scanFrame, seatTarget, SEATING_MIX, BACK_OF_HOUSE_SHARE } from "./auto";
export { findSpot, fits, gapNeeded, makeItem, zoneOf, AISLE_M } from "./place";
export { validate, conflicts, seatCount, countByType } from "./validate";
export { applyOps, type OpContext, type OpResult } from "./ops";
export { layoutCosts, layoutImpact, type LayoutCostLine, type LayoutImpact } from "./costs";
export { simulateDay, seatPoints, demandAt, type DaySim, type SimGuest } from "./sim";
export { describeLayout, describeOps } from "./describe";
export { parseInstruction } from "./parse";
