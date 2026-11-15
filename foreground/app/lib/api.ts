import type { Match } from "./matches";
import type { Exchange } from "./next-question";
import type { TourAction } from "./tour-agent";

export type MatchesResponse = { matches: Match[]; dataAvailable: boolean };
export type NextQuestionResponse = { question: string | null; stub: boolean };
export type TourAgentResponse = { reply: string; action: TourAction; stub: boolean };

export class ApiError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message);
  }
}

/** Same-origin /api/*; next.config.ts proxies it to the Python service (API_URL). */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: { "content-type": "application/json" },
    });
  } catch {
    throw new ApiError("The API is unreachable.", null);
  }
  if (!response.ok) throw new ApiError(`The API answered ${response.status} for ${path}.`, response.status);
  return (await response.json()) as T;
}

const post = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) }) satisfies RequestInit;

export function fetchMatches(brief: Exchange[], limit?: number): Promise<MatchesResponse> {
  return request("/matches", post(limit === undefined ? { brief } : { brief, limit }));
}

export function fetchNextQuestion(history: Exchange[]): Promise<NextQuestionResponse> {
  return request("/next-question", post({ history }));
}

export function fetchTourAgent(message: string, placedCount: number, tourId: string): Promise<TourAgentResponse> {
  return request("/tour-agent", post({ message, placedCount, tourId }));
}
