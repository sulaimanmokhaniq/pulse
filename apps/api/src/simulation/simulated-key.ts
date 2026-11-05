import { createHmac } from 'crypto';

/**
 * Secret key for the simulated-traffic project, derived from the live
 * project's secret key. The dashboard derives the same key, so showing
 * simulated data needs no extra configuration. The dashboard has an identical
 * copy of this function; a shared test vector keeps them in step.
 */
export function simulatedSecretKey(liveSecretKey: string): string {
  return 'sk_' + createHmac('sha256', liveSecretKey).update('pulse:simulated-project').digest('base64url').slice(0, 32);
}

export const SIMULATED_PROJECT_NAME = 'Demo Shop (simulated)';
