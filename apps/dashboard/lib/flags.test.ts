import { describe, expect, it } from 'vitest';
import { checkAdmin, FLAG_KEY_PATTERN, parseFlagChanges, parseNewFlag } from './flags';
import { audience, timeAgo } from './time';

describe('parseFlagChanges', () => {
  it('keeps only enabled and rolloutPercent', () => {
    expect(parseFlagChanges({ enabled: true, description: 'x', rolloutPercent: 40 })).toEqual({
      enabled: true,
      rolloutPercent: 40,
    });
  });

  it('rejects bad values and empty changes', () => {
    expect(parseFlagChanges({ enabled: 'yes' })).toBeNull();
    expect(parseFlagChanges({ rolloutPercent: 101 })).toBeNull();
    expect(parseFlagChanges({ rolloutPercent: 2.5 })).toBeNull();
    expect(parseFlagChanges({ description: 'only this' })).toBeNull();
    expect(parseFlagChanges(null)).toBeNull();
  });
});

describe('parseNewFlag', () => {
  it('fills defaults', () => {
    expect(parseNewFlag({})).toEqual({ enabled: false, rolloutPercent: 100, description: '' });
    expect(parseNewFlag({ description: '  New checkout ' })?.description).toBe('New checkout');
  });

  it('rejects bad values', () => {
    expect(parseNewFlag({ rolloutPercent: -1 })).toBeNull();
    expect(parseNewFlag({ description: 'x'.repeat(501) })).toBeNull();
  });
});

describe('checkAdmin', () => {
  it('is off when no password is configured', () => {
    expect(checkAdmin('anything', undefined)).toBe('disabled');
    expect(checkAdmin(null, '')).toBe('disabled');
  });

  it('accepts only the exact password', () => {
    expect(checkAdmin('s3cret', 's3cret')).toBe('ok');
    expect(checkAdmin('s3cre', 's3cret')).toBe('denied');
    expect(checkAdmin(null, 's3cret')).toBe('denied');
  });
});

describe('flag keys', () => {
  it('matches the API rules', () => {
    expect(FLAG_KEY_PATTERN.test('promo_banner')).toBe(true);
    expect(FLAG_KEY_PATTERN.test('checkout.v2-beta')).toBe(true);
    expect(FLAG_KEY_PATTERN.test('Promo')).toBe(false);
    expect(FLAG_KEY_PATTERN.test('_x')).toBe(false);
    expect(FLAG_KEY_PATTERN.test('a'.repeat(65))).toBe(false);
  });
});

describe('labels', () => {
  it('describes the audience', () => {
    expect(audience(false, 50)).toBe('Off for everyone');
    expect(audience(true, 0)).toBe('Off for everyone');
    expect(audience(true, 100)).toBe('On for everyone');
    expect(audience(true, 25)).toBe('On for 25% of users');
  });

  it('formats relative times', () => {
    const now = Date.parse('2026-10-31T12:00:00Z');
    expect(timeAgo('2026-10-31T11:59:40Z', now)).toBe('just now');
    expect(timeAgo('2026-10-31T11:55:00Z', now)).toBe('5 minutes ago');
    expect(timeAgo('2026-10-30T12:00:00Z', now)).toBe('yesterday');
  });
});
