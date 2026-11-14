/** Server-only. Keys come from the server environment (Next loads foreground/.env.local); never from the browser. */
export function serverEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

/** Thrown when an optional integration has no key. Routes turn it into a 501 "not configured". */
export class NotConfiguredError extends Error {
  constructor(readonly keyName: string) {
    super(`${keyName} is not configured on the server.`);
  }
}

export function requireKey(name: string): string {
  const value = serverEnv(name);
  if (!value) throw new NotConfiguredError(name);
  return value;
}

/** HTTP status for a route failure: 501 when a key is absent, 502 when an upstream failed. */
export function failureStatus(error: unknown): number {
  return error instanceof NotConfiguredError ? 501 : 502;
}
