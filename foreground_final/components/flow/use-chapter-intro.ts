"use client";

import { useEffect, useRef, type Dispatch } from "react";
import type { DealData } from "@/app/flow-actions";
import type { OwnerBrief } from "@/lib/engine";
import { usdRange } from "@/lib/format";
import { layoutImpact } from "@/lib/layout";
import { rentFor } from "@/lib/ml/rent";
import { buildAskList } from "@/lib/outputs/ask-list";
import type { FlowEvent, FlowState } from "./flow-reducer";
import { numbersRead } from "./numbers/data";
import { overviewParagraph } from "./overview/data";

/**
 * The one line each chapter adds to the Guide when it opens for the first time (Overview, Numbers, Deal), built
 * from the same payload as the stage and labelled with where it came from. Once per space and chapter.
 */
export function useChapterIntro(state: FlowState, dispatch: Dispatch<FlowEvent>, data: DealData | null, brief: OwnerBrief | null) {
  const said = useRef(new Set<string>());
  const { chapter, layout } = state;
  const siteId = data?.site.id ?? null;
  useEffect(() => {
    if (!siteId) said.current.clear();
  }, [siteId]);
  useEffect(() => {
    if (!data || !brief || !layout) return;
    if (chapter !== "overview" && chapter !== "numbers" && chapter !== "deal") return;
    const key = `${data.site.id}:${chapter}`;
    if (said.current.has(key)) return;
    said.current.add(key);
    const withCity = { ...brief, city: data.site.city };
    const impact = layoutImpact(data.site, withCity, layout);
    let text: string;
    if (chapter === "overview") text = overviewParagraph(data.site, withCity, impact, rentFor(data.site.id));
    else if (chapter === "numbers") text = numbersRead(impact);
    else {
      const asks = buildAskList(data.site, impact.analysis);
      const top = asks[0];
      text = top
        ? `${asks.length} asks for the landlord. The one to lead with: ${top.title}${top.value ? `, worth ${usdRange(top.value)}` : ""}. Uncheck any you do not want and the letter follows.`
        : "The data supports no ask for this space. The letter would have nothing to ask for.";
    }
    dispatch({ type: "append", at: Date.now(), message: { kind: "assistantText", text, streaming: false, source: "Foreground engine, from the same data as the stage" } });
  }, [chapter, data, brief, layout, dispatch]);
}
