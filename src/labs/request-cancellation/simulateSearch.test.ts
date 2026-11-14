import { expect, test } from "vitest";
import type { Clock } from "./clock.ts";
import { createManualClock } from "./clock.ts";
import {
  createAbortableSearch,
  isAbortError,
  searchFailedMessage,
} from "./simulateSearch.ts";

const reactItem = { id: "react", label: "react" };

test("abort before the delay rejects and a later advance does not resolve", async () => {
  const clock = createManualClock();
  let timerRan = false;
  const wrapped: Clock = {
    now: () => clock.now(),
    schedule(callback, delayMs) {
      return clock.schedule(() => {
        timerRan = true;
        callback();
      }, delayMs);
    },
  };
  const search = createAbortableSearch(wrapped);
  const controller = new AbortController();
  let resolved = false;
  const pending = search({
    query: "re",
    signal: controller.signal,
    delayMs: 600,
    fail: false,
  }).then(
    () => {
      resolved = true;
    },
    (error: unknown) => {
      throw error;
    },
  );
  const assertion = expect(pending).rejects.toSatisfy(isAbortError);

  controller.abort();
  clock.advance(600);

  expect(timerRan).toBe(false);
  expect(resolved).toBe(false);
  await assertion;
});

test("abort after completion leaves the fulfilled value in place", async () => {
  const clock = createManualClock();
  const search = createAbortableSearch(clock);
  const controller = new AbortController();
  const pending = search({
    query: "rea",
    signal: controller.signal,
    delayMs: 80,
    fail: false,
  });

  clock.advance(80);
  await expect(pending).resolves.toEqual([reactItem]);

  controller.abort();
  clock.advance(80);
  await expect(pending).resolves.toEqual([reactItem]);
});

test("fail rejects with Search failed and is not an abort", async () => {
  const clock = createManualClock();
  const search = createAbortableSearch(clock);
  const controller = new AbortController();
  let failed: unknown;
  let resolved = false;
  const pending = search({
    query: "re",
    signal: controller.signal,
    delayMs: 25,
    fail: true,
  }).then(
    () => {
      resolved = true;
    },
    (error: unknown) => {
      failed = error;
      throw error;
    },
  );
  const assertion = expect(pending).rejects.toThrow(searchFailedMessage);

  clock.advance(24);
  expect(resolved).toBe(false);
  expect(failed).toBeUndefined();

  clock.advance(1);
  expect(resolved).toBe(false);
  expect(failed).toBeInstanceOf(Error);
  expect(isAbortError(failed)).toBe(false);
  if (failed instanceof Error) {
    expect(failed.message).toBe(searchFailedMessage);
  }
  await assertion;
});

test("an already aborted signal rejects without scheduling a resolve", async () => {
  const clock = createManualClock();
  let scheduled = 0;
  const wrapped: Clock = {
    now: () => clock.now(),
    schedule(callback, delayMs) {
      scheduled += 1;
      return clock.schedule(callback, delayMs);
    },
  };
  const controller = new AbortController();
  controller.abort();
  const search = createAbortableSearch(wrapped);
  let resolved = false;
  const pending = search({
    query: "re",
    signal: controller.signal,
    delayMs: 600,
    fail: false,
  }).then(
    () => {
      resolved = true;
    },
    (error: unknown) => {
      throw error;
    },
  );

  clock.advance(600);
  expect(scheduled).toBe(0);
  expect(resolved).toBe(false);
  await expect(pending).rejects.toSatisfy(isAbortError);
});

test("resolves prefix matches when the timer fires", async () => {
  const clock = createManualClock();
  const search = createAbortableSearch(clock);
  const pending = search({
    query: "re",
    signal: new AbortController().signal,
    delayMs: 40,
    fail: false,
  });

  clock.advance(39);
  let settled = false;
  void pending.then(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);

  clock.advance(1);
  await expect(pending).resolves.toEqual([
    { id: "react", label: "react" },
    { id: "redux", label: "redux" },
    { id: "relay", label: "relay" },
    { id: "rest", label: "rest" },
    { id: "rendering", label: "rendering" },
  ]);
});

test("an empty query resolves to no rows", async () => {
  const clock = createManualClock();
  const search = createAbortableSearch(clock);
  const pending = search({
    query: "   ",
    signal: new AbortController().signal,
    delayMs: 0,
    fail: false,
  });

  clock.advance(0);
  await expect(pending).resolves.toEqual([]);
});

test("uses the supplied catalog", async () => {
  const clock = createManualClock();
  const search = createAbortableSearch(clock, [{ id: "relay", label: "relay" }]);
  const pending = search({
    query: "re",
    signal: new AbortController().signal,
    delayMs: 5,
    fail: false,
  });

  clock.advance(5);
  await expect(pending).resolves.toEqual([{ id: "relay", label: "relay" }]);
});
