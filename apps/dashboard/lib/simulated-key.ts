import 'server-only';
import { createHmac } from 'crypto';

/**
 * Secret key of the simulated-traffic project, derived from the live key.
 * Must match simulatedSecretKey in apps/api/src/simulation/simulated-key.ts;
 * both test suites check the same vector.
 */
export function simulatedSecretKey(liveSecretKey: string): string {
  return 'sk_' + createHmac('sha256', liveSecretKey).update('pulse:simulated-project').digest('base64url').slice(0, 32);
}
