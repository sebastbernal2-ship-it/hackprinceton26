import type { MessageRendererProps } from "./registry";

/** The owner's words: the only boxed thing in the thread. */
export function UserMessage({ message }: MessageRendererProps<"user">) {
  return (
    <div className="flex justify-end">
      <p className="flow-chat max-w-[85%] rounded-f-md bg-stage-3 px-4 py-2.5 break-words whitespace-pre-wrap text-text">
        <span className="sr-only">You said: </span>
        {message.text}
      </p>
    </div>
  );
}
