import { createHash, randomBytes } from 'crypto';

export type KeyKind = 'ingest' | 'secret';

export const API_KEY_PREFIX = 'pk_';
export const SECRET_KEY_PREFIX = 'sk_';

export function prefixFor(kind: KeyKind): string {
  return kind === 'secret' ? SECRET_KEY_PREFIX : API_KEY_PREFIX;
}

export function generateApiKey(kind: KeyKind = 'ingest'): string {
  return prefixFor(kind) + randomBytes(24).toString('base64url');
}

// Keys are high-entropy random strings, so a fast hash is enough; no salt or
// slow KDF needed. Only the hash is stored.
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function displayPrefix(key: string): string {
  return key.slice(0, 3 + 6);
}
