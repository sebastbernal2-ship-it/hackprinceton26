import { askClaude } from "./anthropic";
import type { ViewQa } from "./types";
import type { SourceImage } from "./visualizer";

/** Claude vision compares the photo before and after the edit. Server only. */

const TOOL = {
  name: "report_qa",
  description: "Report whether the edited photo is a faithful visualization of the intended change.",
  input_schema: {
    type: "object",
    required: ["changeVisible", "outsideRegion", "impossibleGeometry", "note"],
    properties: {
      changeVisible: { type: "boolean", description: "The intended change is actually shown." },
      outsideRegion: { type: "boolean", description: "Something outside the intended region changed: other walls, floor, ceiling, windows, fixtures, camera or framing." },
      impossibleGeometry: { type: "boolean", description: "The result shows geometry that cannot be built or does not match the room: bent perspective, floating elements, walls or openings that contradict the first photo." },
      note: { type: "string", description: "One short sentence for the owner naming the most important difference, or saying it matches." },
    },
  },
} as const;

const SYSTEM = `You check AI-edited photos of a real commercial space. Image 1 is the original photo. Image 2 is the edit. Compare them carefully and call report_qa. Be strict about changes outside the intended region and about geometry; ignore small compression or colour differences.`;

export async function checkView(view: string, before: SourceImage, after: SourceImage, intended: string, region: string, signal?: AbortSignal): Promise<ViewQa | null> {
  const answer = await askClaude({
    system: SYSTEM,
    tools: [TOOL],
    maxTokens: 700,
    timeoutMs: 40_000,
    signal,
    content: [
      { type: "text", text: "Image 1, the original:" },
      { type: "image", source: { type: "base64", media_type: before.mime, data: before.data } },
      { type: "text", text: "Image 2, the edit:" },
      { type: "image", source: { type: "base64", media_type: after.mime, data: after.data } },
      { type: "text", text: `Intended change: ${intended}\nRegion allowed to change: ${region || "only what the change needs"}` },
    ],
  });
  if ("error" in answer) return null;
  const input = answer.content.find((c) => c.type === "tool_use" && c.name === TOOL.name)?.input as Record<string, unknown> | undefined;
  if (!input) return null;
  const outsideRegion = input.outsideRegion === true;
  const impossibleGeometry = input.impossibleGeometry === true;
  return {
    view,
    ok: input.changeVisible !== false && !outsideRegion && !impossibleGeometry,
    outsideRegion,
    impossibleGeometry,
    note: typeof input.note === "string" ? input.note.trim().slice(0, 240) : "",
  };
}
