"use client";

import type { MessageRendererProps } from "./registry";
import { StreamText } from "./stream-text";

/** Unboxed assistant text on the surface: no avatar, no bubble. */
export function AssistantTextMessage({ message }: MessageRendererProps<"assistantText">) {
  return (
    <div className="flex flex-col gap-1.5">
      <StreamText id={message.id} text={message.text} streaming={message.streaming} className="max-w-[60ch]" />
      {message.source ? <p className="flow-source text-text-3">{message.source}</p> : null}
    </div>
  );
}
