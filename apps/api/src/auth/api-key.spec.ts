import { API_KEY_PREFIX, displayPrefix, generateApiKey, hashApiKey } from './api-key';

describe('api keys', () => {
  it('generates unique prefixed keys', () => {
    const a = generateApiKey();
    expect(a.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(a).not.toBe(generateApiKey());
    expect(a.length).toBeGreaterThan(30);
  });

  it('hashes deterministically without storing the key', () => {
    const key = generateApiKey();
    expect(hashApiKey(key)).toBe(hashApiKey(key));
    expect(hashApiKey(key)).not.toContain(key);
    expect(displayPrefix(key)).toHaveLength(API_KEY_PREFIX.length + 6);
  });
});
