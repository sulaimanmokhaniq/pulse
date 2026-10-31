// Browser-side helpers for the dashboard's own /api routes.

const RETRIES = 3;

/** Fetches JSON, retrying while a cold API host wakes up. */
export async function getJson<T>(url: string): Promise<T> {
  let lastError = 'Request failed';
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (res.ok) return body as T;
      lastError = body.error ?? `Request failed (${res.status})`;
      if (res.status < 500) break; // a client error won't fix itself
    } catch {
      lastError = 'Network error';
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(lastError);
}

/** Sends a write once (no retries, so a change is never applied twice by surprise). */
export async function sendJson<T>(
  method: 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T | undefined> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as T;
}
