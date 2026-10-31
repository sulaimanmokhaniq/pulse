import { timingSafeEqual } from 'crypto';

export const FLAG_KEY_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,63}$/;

export type FlagChanges = { enabled?: boolean; rolloutPercent?: number };
export type NewFlag = { enabled: boolean; rolloutPercent: number; description: string };

const isPercent = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 100;

/**
 * The public demo lets anyone switch a flag or move its rollout, and nothing
 * else: other fields are dropped. Returns null if nothing valid remains.
 */
export function parseFlagChanges(body: unknown): FlagChanges | null {
  if (!body || typeof body !== 'object') return null;
  const { enabled, rolloutPercent } = body as Record<string, unknown>;
  const changes: FlagChanges = {};
  if (enabled !== undefined) {
    if (typeof enabled !== 'boolean') return null;
    changes.enabled = enabled;
  }
  if (rolloutPercent !== undefined) {
    if (!isPercent(rolloutPercent)) return null;
    changes.rolloutPercent = rolloutPercent;
  }
  return Object.keys(changes).length ? changes : null;
}

export function parseNewFlag(body: unknown): NewFlag | null {
  if (!body || typeof body !== 'object') return null;
  const { enabled = false, rolloutPercent = 100, description = '' } = body as Record<string, unknown>;
  if (typeof enabled !== 'boolean' || !isPercent(rolloutPercent)) return null;
  if (typeof description !== 'string' || description.length > 500) return null;
  return { enabled, rolloutPercent, description: description.trim() };
}

/**
 * Creating and deleting flags needs DASHBOARD_ADMIN_PASSWORD. When it isn't
 * set, those actions are off entirely rather than open to everyone.
 */
export function checkAdmin(provided: string | null, expected: string | undefined): 'ok' | 'disabled' | 'denied' {
  if (!expected) return 'disabled';
  if (!provided) return 'denied';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? 'ok' : 'denied';
}
