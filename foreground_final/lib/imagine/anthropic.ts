/** Minimal Messages API call, the same shape app/api/layout uses. Server only. */

export const CLAUDE_MODEL = "claude-sonnet-5-5";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export type ToolUse = { type: string; name?: string; input?: unknown };

export async function askClaude(opts: {
  system: string;
  content: ContentBlock[];
  tools: readonly unknown[];
  maxTokens: number;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<{ content: ToolUse[] } | { error: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { error: "no-key" };
  try {
    const timeout = AbortSignal.timeout(opts.timeoutMs);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: opts.maxTokens,
        system: opts.system,
        tools: opts.tools,
        // this model rejects a forced tool; the system prompt requires the call and a miss falls back
        tool_choice: { type: "auto" },
        messages: [{ role: "user", content: opts.content }],
      }),
      signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout,
    });
    if (!res.ok) return { error: `status-${res.status}` };
    const data = (await res.json()) as { content?: ToolUse[] };
    return { content: data.content ?? [] };
  } catch (e) {
    return { error: e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network" };
  }
}
