import { expect, test } from "vitest";
import { cacheCapacity, cacheTtl, createLookupCache } from "./cache.ts";

const ada = "Ada Lovelace";
const bea = "Bea Atlas";
const cam = "Cam Rivera";

test("a hit before expiry keeps storedAt and expiresAt and advances recency", () => {
  const cache = createLookupCache();
  cache.insert("ada", ada, 0);

  const stored = cache.snapshot(0).entries[0];
  expect(stored).toMatchObject({
    key: "ada",
    value: ada,
    storedAt: 0,
    expiresAt: cacheTtl,
    recency: 1,
    freshness: "fresh",
  });

  expect(cache.read("ada", 4)).toEqual({ hit: true, value: ada });

  const afterHit = cache.snapshot(4).entries[0];
  expect(afterHit).toMatchObject({
    storedAt: 0,
    expiresAt: 5,
    recency: 2,
    freshness: "fresh",
    value: ada,
  });
  expect(cache.snapshot(5).entries[0]).toMatchObject({
    freshness: "expired",
    expiresAt: 5,
    storedAt: 0,
  });
  expect(cache.snapshot(5).entries).toHaveLength(1);
  expect(cache.snapshot(5).evictions).toEqual([]);
});

test("a read at expiresAt misses as expired and removes the entry", () => {
  const cache = createLookupCache();
  cache.insert("ada", ada, 0);

  expect(cache.read("ada", 5)).toEqual({ hit: false, reason: "expired" });
  expect(cache.snapshot(5).entries).toEqual([]);
  expect(cache.snapshot(5).evictions).toEqual([
    { key: "ada", value: ada, reason: "expired", at: 5 },
  ]);
  expect(cache.read("ada", 5)).toEqual({ hit: false, reason: "missing" });
});

test("equal ticks use recency, so a hit keeps ada and the next insert evicts bea", () => {
  const cache = createLookupCache();
  cache.insert("ada", ada, 0);
  cache.insert("bea", bea, 0);

  expect(cache.read("ada", 1)).toEqual({ hit: true, value: ada });
  cache.insert("cam", cam, 1);

  const snap = cache.snapshot(1);
  expect(snap.entries.map((entry) => entry.key)).toEqual(["ada", "cam"]);
  expect(snap.evictions).toEqual([{ key: "bea", value: bea, reason: "capacity", at: 1 }]);
  expect(snap.entries.find((entry) => entry.key === "ada")).toMatchObject({
    storedAt: 0,
    expiresAt: 5,
    recency: 3,
    freshness: "fresh",
    value: ada,
  });
  expect(snap.entries.find((entry) => entry.key === "cam")).toMatchObject({
    storedAt: 1,
    expiresAt: 6,
    recency: 4,
    freshness: "fresh",
    value: cam,
  });
});

test("expired entries leave before capacity eviction", () => {
  const cache = createLookupCache();
  cache.insert("ada", ada, 0);
  cache.insert("bea", bea, 0);
  cache.insert("cam", cam, 5);

  const snap = cache.snapshot(5);
  expect(snap.entries).toEqual([
    {
      key: "cam",
      value: cam,
      storedAt: 5,
      expiresAt: 10,
      recency: 3,
      freshness: "fresh",
    },
  ]);
  expect(snap.evictions).toEqual([
    { key: "ada", value: ada, reason: "expired", at: 5 },
    { key: "bea", value: bea, reason: "expired", at: 5 },
  ]);
  expect(snap.evictions.some((eviction) => eviction.reason === "capacity")).toBe(false);
});

test("invalidate removes the key and the next read is missing", () => {
  const cache = createLookupCache();
  cache.insert("ada", ada, 0);
  cache.insert("bea", bea, 0);
  cache.invalidate("ada", 2);

  expect(cache.read("ada", 2)).toEqual({ hit: false, reason: "missing" });
  const snap = cache.snapshot(2);
  expect(snap.entries.map((entry) => entry.key)).toEqual(["bea"]);
  expect(snap.evictions).toEqual([
    { key: "ada", value: ada, reason: "invalidated", at: 2 },
  ]);

  cache.invalidate("missing", 2);
  expect(cache.snapshot(2).evictions).toHaveLength(1);
});

test("replacing a fresh key keeps the other occupant", () => {
  const cache = createLookupCache();
  cache.insert("ada", ada, 0);
  cache.insert("bea", bea, 0);
  cache.insert("ada", "Ada Lovelace (revised)", 2);

  const snap = cache.snapshot(2);
  expect(snap.evictions).toEqual([]);
  expect(snap.entries.map((entry) => entry.key)).toEqual(["ada", "bea"]);
  expect(snap.entries.find((entry) => entry.key === "ada")).toMatchObject({
    value: "Ada Lovelace (revised)",
    storedAt: 2,
    expiresAt: 7,
    recency: 3,
    freshness: "fresh",
  });
  expect(snap.entries.find((entry) => entry.key === "bea")).toMatchObject({
    value: bea,
    storedAt: 0,
    expiresAt: 5,
    recency: 2,
    freshness: "fresh",
  });
  expect(cache.read("ada", 2)).toEqual({ hit: true, value: "Ada Lovelace (revised)" });
});

test("the eviction log keeps the latest 50", () => {
  const cache = createLookupCache();
  cache.insert("seed-a", "a", 0);
  cache.insert("seed-b", "b", 0);

  for (let index = 0; index < 51; index += 1) {
    cache.insert(`extra-${index}`, `value-${index}`, 0);
  }

  const evictions = cache.snapshot(0).evictions;
  expect(evictions).toHaveLength(50);
  expect(evictions[0]).toMatchObject({ key: "seed-b", reason: "capacity" });
  expect(evictions[49]).toMatchObject({ key: "extra-48", reason: "capacity" });
  expect(cacheCapacity).toBe(2);
});
