interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

const SHORT_TTL = 60_000;

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function cacheSet<T>(key: string, value: T, ttl = SHORT_TTL): void {
  store.set(key, { value, expiresAt: Date.now() + ttl });
}

export function cacheDelete(key: string): void {
  store.delete(key);
}
