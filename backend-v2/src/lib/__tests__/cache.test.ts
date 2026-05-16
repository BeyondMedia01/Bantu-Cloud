import { describe, it, expect, beforeEach } from 'vitest';
import { cacheGet, cacheSet, cacheDelete } from '../cache';

describe('cache', () => {
  beforeEach(() => {
    // Clean up by deleting keys that might have been set
    cacheDelete('test-key');
    cacheDelete('expiry-key');
  });

  it('stores and retrieves a value', () => {
    cacheSet('test-key', { name: 'test' });
    const value = cacheGet<{ name: string }>('test-key');
    expect(value).toEqual({ name: 'test' });
  });

  it('returns undefined for missing key', () => {
    const value = cacheGet('nonexistent');
    expect(value).toBeUndefined();
  });

  it('deletes a key', () => {
    cacheSet('test-key', 'value');
    cacheDelete('test-key');
    expect(cacheGet('test-key')).toBeUndefined();
  });

  it('overwrites existing value', () => {
    cacheSet('test-key', 'first');
    cacheSet('test-key', 'second');
    expect(cacheGet('test-key')).toBe('second');
  });

  it('expires after TTL', async () => {
    cacheSet('expiry-key', 'value', 10);
    expect(cacheGet('expiry-key')).toBe('value');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(cacheGet('expiry-key')).toBeUndefined();
  });
});
