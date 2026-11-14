import { requireKey } from "./server-env";

const MODELS = ["claude-sonnet-4-5", "claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"];

export async function askClaude(system: string, user: string): Promise<string> {
  const key = requireKey("ANTHROPIC_API_KEY");
  let lastError = "Anthropic did not answer.";
  for (const model of MODELS) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 900,
        temperature: 0.2,
        system,
        messages: [{ role: "user", content: user }],
      }),
      cache: "no-store",
    });
    if (response.status === 404) {
      lastError = `${model} is not available.`;
      continue;
    }
    const body = (await response.json()) as {
      error?: { message?: string };
      content?: { type?: string; text?: string }[];
    };
    if (!response.ok) {
      lastError = body.error?.message || `Anthropic request failed (${response.status}).`;
      if (response.status === 400 || response.status === 401 || response.status === 403) break;
      continue;
    }
    const text = body.content?.map((part) => part.text || "").join("\n").trim() || "";
    if (text) return text;
  }
  throw new Error(lastError);
}

export function parseJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1)) as unknown;
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
