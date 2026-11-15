"use client";

import { createContext, useContext } from "react";
import type { OfferBrief } from "./messages/offer-cta";

/** Things a message renderer may need that are not on the message itself. */
export type FlowContextValue = {
  /** the old search page for the current brief; null until the brief is complete */
  searchHref: string | null;
  /** the brief the offer email is drafted from */
  brief: OfferBrief | null;
  /** phone sheet at its peek snap: messages show their short form */
  compact: boolean;
};

export const FlowContext = createContext<FlowContextValue>({ searchHref: null, brief: null, compact: false });

export function useFlowContext(): FlowContextValue {
  return useContext(FlowContext);
}
