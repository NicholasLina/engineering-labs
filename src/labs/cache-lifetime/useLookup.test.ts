import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import { defaultSource, useLookup } from "./useLookup.ts";

test("the first lookup reads the source and the second is a hit", () => {
  const { result } = renderHook(() => useLookup());

  act(() => {
    result.current.lookup("ada");
    result.current.lookup("ada");
  });

  expect(result.current.log.map((entry) => entry.kind)).toEqual(["source", "hit"]);
  expect(result.current.log.filter((entry) => entry.kind === "source")).toHaveLength(1);
  expect(result.current.log.filter((entry) => entry.kind === "hit")).toHaveLength(1);
  expect(result.current.source.ada).toBe(defaultSource.ada);
  expect(result.current.log[0]).toEqual({
    kind: "source",
    key: "ada",
    value: "Ada Lovelace",
    at: 0,
  });
  expect(result.current.log[1]).toEqual({
    kind: "hit",
    key: "ada",
    value: "Ada Lovelace",
    at: 0,
  });
  expect(result.current.entries[0]).toMatchObject({
    value: "Ada Lovelace",
    storedAt: 0,
    expiresAt: 5,
  });
});

test("a lookup at tick 4 hits and a lookup at tick 5 reads the source", () => {
  const { result } = renderHook(() => useLookup());

  act(() => {
    result.current.lookup("ada");
    result.current.advance(4);
    result.current.lookup("ada");
  });

  expect(result.current.now).toBe(4);
  expect(result.current.result).toEqual({
    kind: "hit",
    key: "ada",
    value: "Ada Lovelace",
    at: 4,
  });
  expect(result.current.entries[0]).toMatchObject({
    storedAt: 0,
    expiresAt: 5,
    freshness: "fresh",
  });

  act(() => {
    result.current.advance(1);
    result.current.lookup("ada");
  });

  expect(result.current.now).toBe(5);
  expect(result.current.result).toEqual({
    kind: "source",
    key: "ada",
    value: "Ada Lovelace",
    at: 5,
  });
  expect(result.current.entries[0]).toMatchObject({
    key: "ada",
    storedAt: 5,
    expiresAt: 10,
    freshness: "fresh",
  });
  expect(result.current.evictions).toEqual([
    { key: "ada", value: "Ada Lovelace", reason: "expired", at: 5 },
  ]);
});

test("editing the source leaves the cached value until invalidate", () => {
  const { result } = renderHook(() => useLookup());

  act(() => {
    result.current.lookup("ada");
    result.current.setSource("ada", "Ada Lovelace (revised)");
    result.current.lookup("ada");
  });

  expect(result.current.source.ada).toBe("Ada Lovelace (revised)");
  expect(result.current.result).toEqual({
    kind: "hit",
    key: "ada",
    value: "Ada Lovelace",
    at: 0,
  });
  expect(result.current.entries[0]?.value).toBe("Ada Lovelace");
  expect(result.current.evictions).toEqual([]);

  act(() => {
    result.current.invalidate("ada");
    result.current.lookup("ada");
  });

  expect(result.current.evictions).toEqual([
    { key: "ada", value: "Ada Lovelace", reason: "invalidated", at: 0 },
  ]);
  expect(result.current.result).toEqual({
    kind: "source",
    key: "ada",
    value: "Ada Lovelace (revised)",
    at: 0,
  });
  expect(result.current.log.map((entry) => entry.kind)).toEqual(["source", "hit", "source"]);
  expect(result.current.entries[0]?.value).toBe("Ada Lovelace (revised)");
});

test("the third lookup at tick 0 evicts ada for capacity", () => {
  const { result } = renderHook(() => useLookup());

  act(() => {
    result.current.lookup("ada");
    result.current.lookup("bea");
    result.current.lookup("cam");
  });

  expect(result.current.now).toBe(0);
  expect(result.current.log.map((entry) => entry.kind)).toEqual(["source", "source", "source"]);
  expect(result.current.evictions).toEqual([
    { key: "ada", value: "Ada Lovelace", reason: "capacity", at: 0 },
  ]);
  expect(result.current.entries.map((entry) => entry.key)).toEqual(["bea", "cam"]);
  expect(result.current.entries.map((entry) => entry.value)).toEqual(["Bea Atlas", "Cam Rivera"]);
});

test("advance keeps an expired entry until a later read or insert", () => {
  const { result } = renderHook(() => useLookup());

  act(() => {
    result.current.lookup("ada");
    result.current.advance(5);
  });

  expect(result.current.now).toBe(5);
  expect(result.current.entries).toEqual([
    expect.objectContaining({
      key: "ada",
      freshness: "expired",
      expiresAt: 5,
      value: "Ada Lovelace",
    }),
  ]);
  expect(result.current.evictions).toEqual([]);

  act(() => {
    result.current.lookup("bea");
  });

  expect(result.current.evictions).toEqual([
    expect.objectContaining({ key: "ada", reason: "expired", at: 5 }),
  ]);
  expect(result.current.entries.map((entry) => entry.key)).toEqual(["bea"]);
  expect(result.current.entries[0]).toMatchObject({ freshness: "fresh", expiresAt: 10 });
});

test("an unknown key logs a miss and does not insert", () => {
  const { result } = renderHook(() => useLookup());

  act(() => {
    result.current.lookup("nope");
  });

  expect(result.current.log).toEqual([{ kind: "miss", key: "nope", value: null, at: 0 }]);
  expect(result.current.result).toEqual({ kind: "miss", key: "nope", value: null, at: 0 });
  expect(result.current.entries).toEqual([]);
  expect(result.current.evictions).toEqual([]);
});

test("advanceToExpiry uses the earliest stored expiry and ignores an empty cache", () => {
  const { result } = renderHook(() => useLookup());

  act(() => {
    result.current.advanceToExpiry();
  });
  expect(result.current.now).toBe(0);

  act(() => {
    result.current.lookup("ada");
    result.current.advance(2);
    result.current.lookup("bea");
    result.current.advanceToExpiry();
  });

  expect(result.current.now).toBe(5);
  expect(result.current.entries.map((entry) => [entry.key, entry.freshness, entry.expiresAt])).toEqual([
    ["ada", "expired", 5],
    ["bea", "fresh", 7],
  ]);
});

test("reset restores the clock, cache, log, and source", () => {
  const { result } = renderHook(() => useLookup());

  act(() => {
    result.current.lookup("ada");
    result.current.advance(3);
    result.current.setSource("ada", "Changed");
    result.current.reset();
  });

  expect(result.current.now).toBe(0);
  expect(result.current.log).toEqual([]);
  expect(result.current.result).toBeNull();
  expect(result.current.entries).toEqual([]);
  expect(result.current.evictions).toEqual([]);
  expect(result.current.source).toEqual({
    ada: "Ada Lovelace",
    bea: "Bea Atlas",
    cam: "Cam Rivera",
  });
});

test("the lookup log keeps the latest 50", () => {
  const { result } = renderHook(() => useLookup());

  act(() => {
    for (let index = 0; index < 51; index += 1) {
      result.current.lookup(`missing-${index}`);
    }
  });

  expect(result.current.log).toHaveLength(50);
  expect(result.current.log[0]).toMatchObject({ kind: "miss", key: "missing-1" });
  expect(result.current.log[49]).toMatchObject({ kind: "miss", key: "missing-50" });
  expect(result.current.entries).toEqual([]);
});
