export const cacheTtl = 5;
export const cacheCapacity = 2;

const evictionLimit = 50;

export type EvictionReason = "expired" | "capacity" | "invalidated";

export type CacheRead =
  | { hit: true; value: string }
  | { hit: false; reason: "missing" | "expired" };

export type CacheEntry = {
  key: string;
  value: string;
  storedAt: number;
  expiresAt: number;
  recency: number;
  freshness: "fresh" | "expired";
};

export type CacheEviction = {
  key: string;
  value: string;
  reason: EvictionReason;
  at: number;
};

export type CacheSnapshot = {
  entries: CacheEntry[];
  evictions: CacheEviction[];
};

export type LookupCache = {
  read: (key: string, now: number) => CacheRead;
  insert: (key: string, value: string, now: number) => void;
  invalidate: (key: string, now: number) => void;
  snapshot: (now: number) => CacheSnapshot;
};

type StoredEntry = {
  key: string;
  value: string;
  storedAt: number;
  expiresAt: number;
  recency: number;
};

function isFresh(expiresAt: number, now: number): boolean {
  return now < expiresAt;
}

export function createLookupCache(): LookupCache {
  const stored = new Map<string, StoredEntry>();
  const evictions: CacheEviction[] = [];
  let nextRecency = 1;

  function takeRecency(): number {
    const recency = nextRecency;
    nextRecency += 1;
    return recency;
  }

  function remember(entry: StoredEntry, reason: EvictionReason, now: number) {
    evictions.push({
      key: entry.key,
      value: entry.value,
      reason,
      at: now,
    });
    if (evictions.length > evictionLimit) {
      evictions.splice(0, evictions.length - evictionLimit);
    }
  }

  function dropExpired(now: number) {
    for (const entry of [...stored.values()]) {
      if (!isFresh(entry.expiresAt, now)) {
        stored.delete(entry.key);
        remember(entry, "expired", now);
      }
    }
  }

  function evictLeastRecent(now: number) {
    let oldest: StoredEntry | undefined;
    for (const entry of stored.values()) {
      if (oldest === undefined || entry.recency < oldest.recency) {
        oldest = entry;
      }
    }
    if (oldest === undefined) {
      return;
    }

    stored.delete(oldest.key);
    remember(oldest, "capacity", now);
  }

  return {
    read(key, now) {
      const entry = stored.get(key);
      if (entry === undefined) {
        return { hit: false, reason: "missing" };
      }
      if (!isFresh(entry.expiresAt, now)) {
        stored.delete(key);
        remember(entry, "expired", now);
        return { hit: false, reason: "expired" };
      }

      entry.recency = takeRecency();
      return { hit: true, value: entry.value };
    },

    insert(key, value, now) {
      dropExpired(now);
      const existing = stored.get(key);
      if (existing !== undefined) {
        existing.value = value;
        existing.storedAt = now;
        existing.expiresAt = now + cacheTtl;
        existing.recency = takeRecency();
        return;
      }

      if (stored.size >= cacheCapacity) {
        evictLeastRecent(now);
      }

      stored.set(key, {
        key,
        value,
        storedAt: now,
        expiresAt: now + cacheTtl,
        recency: takeRecency(),
      });
    },

    invalidate(key, now) {
      const entry = stored.get(key);
      if (entry === undefined) {
        return;
      }

      stored.delete(key);
      remember(entry, "invalidated", now);
    },

    snapshot(now) {
      return {
        entries: [...stored.values()].map((entry) => ({
          key: entry.key,
          value: entry.value,
          storedAt: entry.storedAt,
          expiresAt: entry.expiresAt,
          recency: entry.recency,
          freshness: isFresh(entry.expiresAt, now) ? "fresh" : "expired",
        })),
        evictions: evictions.map((eviction) => ({ ...eviction })),
      };
    },
  };
}
