import { expect, test } from "vitest";
import { describeCache } from "./describeCache.ts";
import type { CacheEntry, CacheEviction } from "./cache.ts";
import type { LookupLogEntry } from "./useLookup.ts";

const boundary = "A record is fresh while now < expiresAt and expired when now >= expiresAt.";
const policy =
  "Capacity is 2. An insert expires 5 ticks after storedAt. A hit does not move expiresAt.";

function entry(overrides: Partial<CacheEntry> & Pick<CacheEntry, "key" | "freshness">): CacheEntry {
  return {
    value: overrides.key,
    storedAt: 0,
    expiresAt: 5,
    recency: 1,
    ...overrides,
  };
}

test("idle copy says no lookup has run", () => {
  expect(describeCache({ now: 0, log: [], entries: [], evictions: [] })).toEqual({
    happened: "No lookup has run yet.",
    clock: `The clock is 0. ${boundary}`,
    lookup: "A lookup has not run. The log records a hit, a source read, or a miss.",
    cache: `The cache is empty. ${policy}`,
  });
});

test("a hit describes the stored record and its freshness", () => {
  const log: LookupLogEntry[] = [
    { kind: "source", key: "ada", value: "Ada Lovelace", at: 0 },
    { kind: "hit", key: "ada", value: "Ada Lovelace", at: 4 },
  ];
  const entries = [
    entry({
      key: "ada",
      value: "Ada Lovelace",
      storedAt: 0,
      expiresAt: 5,
      recency: 2,
      freshness: "fresh",
    }),
  ];

  expect(describeCache({ now: 4, log, entries, evictions: [] })).toEqual({
    happened: 'Hit for ada returned the stored record "Ada Lovelace".',
    clock: `The clock is 4. ${boundary}`,
    lookup: "Hit ada at tick 4: Ada Lovelace.",
    cache: `Stored: ada is fresh, storedAt 0, expiresAt 5, recency 2. ${policy}`,
  });
});

test("an expired entry that is still stored says so", () => {
  const log: LookupLogEntry[] = [{ kind: "source", key: "ada", value: "Ada Lovelace", at: 0 }];
  const entries = [
    entry({
      key: "ada",
      value: "Ada Lovelace",
      storedAt: 0,
      expiresAt: 5,
      recency: 1,
      freshness: "expired",
    }),
  ];

  expect(describeCache({ now: 5, log, entries, evictions: [] })).toEqual({
    happened:
      'Source read for ada stored "Ada Lovelace". ada is expired and still stored. The next read or insert removes it.',
    clock: `The clock is 5. ${boundary}`,
    lookup: "Source read ada at tick 0: Ada Lovelace.",
    cache: `Stored: ada is expired, storedAt 0, expiresAt 5, recency 1. ${policy}`,
  });
});

test("a capacity eviction names the removed key", () => {
  const log: LookupLogEntry[] = [
    { kind: "source", key: "ada", value: "Ada Lovelace", at: 0 },
    { kind: "source", key: "bea", value: "Bea Atlas", at: 0 },
    { kind: "source", key: "cam", value: "Cam Rivera", at: 0 },
  ];
  const entries = [
    entry({ key: "bea", value: "Bea Atlas", recency: 2, freshness: "fresh" }),
    entry({ key: "cam", value: "Cam Rivera", recency: 3, freshness: "fresh" }),
  ];
  const evictions: CacheEviction[] = [
    { key: "ada", value: "Ada Lovelace", reason: "capacity", at: 0 },
  ];

  expect(describeCache({ now: 0, log, entries, evictions })).toEqual({
    happened:
      'Source read for cam stored "Cam Rivera". The latest eviction removed ada (capacity).',
    clock: `The clock is 0. ${boundary}`,
    lookup: "Source read cam at tick 0: Cam Rivera.",
    cache: `Stored: bea is fresh, storedAt 0, expiresAt 5, recency 2; cam is fresh, storedAt 0, expiresAt 5, recency 3. The latest eviction removed ada (capacity). ${policy}`,
  });
});
