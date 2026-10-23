import { createHash, randomBytes } from 'crypto';

export const API_KEY_PREFIX = 'pk_';

export function generateApiKey(): string {
  return API_KEY_PREFIX + randomBytes(24).toString('base64url');
}

// Keys are high-entropy random strings, so a fast hash is enough; no salt or
// slow KDF needed. Only the hash is stored.
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function displayPrefix(key: string): string {
  return key.slice(0, API_KEY_PREFIX.length + 6);
}
