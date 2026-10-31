import { createHash } from 'crypto';

/**
 * Stable bucket in [0, 100) with two decimals of precision for a flag and a user.
 * Hashing the flag key with the id means each flag picks a different slice of
 * users, while the same user always lands in the same place for a given flag.
 */
export function bucketFor(flagKey: string, distinctId: string): number {
  const digest = createHash('sha1').update(`${flagKey}.${distinctId}`).digest();
  return (digest.readUInt32BE(0) % 10_000) / 100;
}

export function isInRollout(flagKey: string, distinctId: string, rolloutPercent: number): boolean {
  if (rolloutPercent >= 100) return true;
  if (rolloutPercent <= 0) return false;
  return bucketFor(flagKey, distinctId) < rolloutPercent;
}
