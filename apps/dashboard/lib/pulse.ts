import 'server-only';
import { simulatedSecretKey } from './simulated-key';
import type { Source } from './types';

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
export async function pulseRequest<T>(
  path: string,
  init: { method?: string; body?: unknown; source?: Source } = {},
): Promise<T> {
  const base = process.env.PULSE_API_URL;
  const liveKey = process.env.PULSE_SECRET_KEY;
  if (!base || !liveKey) throw new PulseError('Dashboard is not configured: set PULSE_API_URL and PULSE_SECRET_KEY', 500);

  const key = init.source === 'simulated' ? simulatedSecretKey(liveKey) : liveKey;
  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new PulseError('The Pulse API did not respond', 504);
  }
  if (res.status === 401) throw new PulseError('The Pulse API rejected the dashboard key', 502);
  if (res.status === 404) throw new PulseError('Not found', 404);
  if (res.status === 400) {
    const body = await res.json().catch(() => ({}));
    const detail = Array.isArray(body.message) ? body.message.join('; ') : body.message;
    throw new PulseError(detail ? `Invalid request: ${detail}` : 'Invalid request', 400);
  }
  if (!res.ok) throw new PulseError(`The Pulse API returned ${res.status}`, res.status >= 500 ? 503 : 502);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const pulseGet = <T>(path: string, source: Source = 'live') => pulseRequest<T>(path, { source });

export function errorResponse(err: unknown): Response {
  const status = err instanceof PulseError ? err.status : 500;
  const message = err instanceof Error ? err.message : 'Unexpected error';
  return Response.json({ error: message }, { status });
}
