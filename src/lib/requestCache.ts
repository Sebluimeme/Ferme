/**
 * requestCache.ts
 * Tiny keyed cache with a short TTL and in-flight request de-duplication.
 * No framework/network dependency — used to avoid repeated round-trips for
 * data that changes rarely but is requested by several components/pages
 * within the same client session.
 */

interface CacheEntry<T> {
  value: T;
  fetchedAt: number;
}

export interface RequestCacheOptions {
  /** Bypasses a cached value that is still within its TTL. Still joins an in-flight request for the same key. */
  force?: boolean;
  /** Overrides "now" for deterministic tests. */
  now?: number;
}

export class KeyedRequestCache<K, T> {
  private readonly ttlMs: number;
  private readonly cache = new Map<K, CacheEntry<T>>();
  private readonly inflight = new Map<K, Promise<T>>();

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  /**
   * Returns a fresh cached value, joins an in-flight request for the same
   * key, or starts a new one via `fetcher`. Rejections are never cached, so
   * the next call — even a moment later — always retries for real instead of
   * replaying a stale failure.
   */
  async get(key: K, fetcher: () => Promise<T>, options: RequestCacheOptions = {}): Promise<T> {
    const now = options.now ?? Date.now();

    if (!options.force) {
      const cached = this.cache.get(key);
      if (cached && now - cached.fetchedAt < this.ttlMs) return cached.value;
    }

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const promise = fetcher()
      .then((value) => {
        this.cache.set(key, { value, fetchedAt: options.now ?? Date.now() });
        this.inflight.delete(key);
        return value;
      })
      .catch((err: unknown) => {
        this.inflight.delete(key);
        throw err;
      });
    this.inflight.set(key, promise);
    return promise;
  }

  /** Drops all cached values and in-flight tracking. */
  reset(): void {
    this.cache.clear();
    this.inflight.clear();
  }
}
