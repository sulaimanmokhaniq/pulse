import { bucketFor, isInRollout } from './bucket';

describe('flag bucketing', () => {
  const ids = Array.from({ length: 10_000 }, (_, i) => `user-${i}`);

  it('is stable for the same flag and user', () => {
    expect(bucketFor('promo_banner', 'user-1')).toBe(bucketFor('promo_banner', 'user-1'));
  });

  it('stays in [0, 100)', () => {
    for (const id of ids.slice(0, 1000)) {
      const b = bucketFor('f', id);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(100);
    }
  });

  it('puts roughly the rollout share of users in', () => {
    const share = ids.filter((id) => isInRollout('promo_banner', id, 30)).length / ids.length;
    expect(share).toBeGreaterThan(0.28);
    expect(share).toBeLessThan(0.32);
  });

  it('only adds users when the rollout grows', () => {
    const at20 = ids.filter((id) => isInRollout('f', id, 20));
    expect(at20.every((id) => isInRollout('f', id, 50))).toBe(true);
  });

  it('picks different users for different flags', () => {
    const a = new Set(ids.filter((id) => isInRollout('flag_a', id, 50)));
    const overlap = ids.filter((id) => isInRollout('flag_b', id, 50) && a.has(id)).length / ids.length;
    expect(overlap).toBeGreaterThan(0.2);
    expect(overlap).toBeLessThan(0.3);
  });

  it('handles 0 and 100', () => {
    expect(ids.some((id) => isInRollout('f', id, 0))).toBe(false);
    expect(ids.every((id) => isInRollout('f', id, 100))).toBe(true);
  });
});
