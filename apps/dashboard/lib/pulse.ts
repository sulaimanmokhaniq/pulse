import 'server-only';

export class PulseError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// The free API host sleeps when idle and can take up to a minute to wake.
const TIMEOUT_MS = 55_000;

/** Calls the Pulse API with the project's secret key. Server-side only. */
export async function pulseGet<T>(path: string): Promise<T> {
  const base = process.env.PULSE_API_URL;
  const key = process.env.PULSE_SECRET_KEY;
  if (!base || !key) throw new PulseError('Dashboard is not configured: set PULSE_API_URL and PULSE_SECRET_KEY', 500);

  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new PulseError('The Pulse API did not respond', 504);
  }
  if (res.status === 401) throw new PulseError('The Pulse API rejected the dashboard key', 502);
  if (!res.ok) throw new PulseError(`The Pulse API returned ${res.status}`, res.status >= 500 ? 503 : 502);
  return (await res.json()) as T;
}

export function errorResponse(err: unknown): Response {
  const status = err instanceof PulseError ? err.status : 500;
  const message = err instanceof Error ? err.message : 'Unexpected error';
  return Response.json({ error: message }, { status });
}
