import type { ComponentType, ReactNode } from "react";
import type { FlowAction, FlowPhase, Message, MessageKind, MessageOf } from "../types";
import { AssistantTextMessage } from "./assistant-text";
import { ChapterDividerMessage } from "./chapter-divider";
import { ClarifyChipsMessage } from "./clarify-chips";
import { PickCardsMessage } from "./pick-cards";
import { ImagineResultMessage } from "./imagine-result";
import { OfferCtaMessage } from "./offer-cta";
import { OutlookChartMessage } from "./outlook-chart";
import { WalkStepMessage } from "./walk-step";
import { useFlowContext } from "../flow-context";
import { SearchProgressMessage } from "./search-progress";
import { UserMessage } from "./user";

/** What every message renderer receives. */
export type MessageRendererProps<K extends MessageKind> = {
  message: MessageOf<K>;
  phase: FlowPhase;
  /** true for the newest message in the thread */
  latest: boolean;
  onAction: (a: FlowAction) => void;
};

export type MessageRenderer<K extends MessageKind> = ComponentType<MessageRendererProps<K>>;

/**
 * One renderer per message kind. To build a kind: write messages/<kind>.tsx exporting a component that takes
 * MessageRendererProps<"kind">, and swap it in here for PlaceholderMessage. The mapped type makes a missing
 * kind a type error.
 */
function OfferCtaWithBrief(p: MessageRendererProps<"offerCta">) {
  const { brief } = useFlowContext();
  return brief ? <OfferCtaMessage {...p} brief={brief} /> : null;
}

export const messageRegistry: { [K in MessageKind]: MessageRenderer<K> } = {
  user: UserMessage,
  assistantText: AssistantTextMessage,
  chapterDivider: ChapterDividerMessage,
  clarifyChips: ClarifyChipsMessage,
  searchProgress: SearchProgressMessage,
  pickCards: PickCardsMessage,
  walkStep: WalkStepMessage,
  imagineResult: ImagineResultMessage,
  outlookChart: OutlookChartMessage,
  offerCta: OfferCtaWithBrief,
};

/** Kinds that break out of the 720 column (Pick is 1120 wide on desktop). */
export const WIDE_KINDS: ReadonlySet<MessageKind> = new Set<MessageKind>(["pickCards"]);

export function renderMessage(message: Message, rest: Omit<MessageRendererProps<MessageKind>, "message">): ReactNode {
  const Renderer = messageRegistry[message.kind] as MessageRenderer<MessageKind>;
  return <Renderer message={message} {...rest} />;
}
