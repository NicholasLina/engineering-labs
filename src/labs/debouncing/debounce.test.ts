import { expect, test } from "vitest";
import { createManualClock } from "./clock.ts";
import { createDebounceScheduler } from "./debounce.ts";

test("a burst resets the timer and fires once after the pause", () => {
  const clock = createManualClock();
  const fired: { query: string; at: number }[] = [];
  const scheduler = createDebounceScheduler(clock, (query) => {
    fired.push({ query, at: clock.now() });
  });
  const burst = [
    ["r", 0],
    ["re", 40],
    ["rea", 80],
    ["reac", 120],
    ["react", 160],
  ] as const;

  for (const [query, at] of burst) {
    clock.advance(at - clock.now());
    scheduler.arm(query, 300);
  }

  expect(scheduler.pending).toEqual({ query: "react", fireAt: 460 });
  clock.advance(299);
  expect(fired).toEqual([]);
  expect(clock.now()).toBe(459);

  clock.advance(1);
  expect(fired).toEqual([{ query: "react", at: 460 }]);
  expect(scheduler.pending).toBeNull();
  expect(clock.now()).toBe(460);
});

test("a pause lets each quiet gap fire", () => {
  const clock = createManualClock();
  const fired: { query: string; at: number }[] = [];
  const scheduler = createDebounceScheduler(clock, (query) => {
    fired.push({ query, at: clock.now() });
  });

  scheduler.arm("re", 300);
  clock.advance(299);
  expect(fired).toEqual([]);
  clock.advance(1);
  expect(fired).toEqual([{ query: "re", at: 300 }]);
  expect(scheduler.pending).toBeNull();

  clock.advance(400);
  expect(clock.now()).toBe(700);
  scheduler.arm("rea", 300);
  expect(scheduler.pending).toEqual({ query: "rea", fireAt: 1000 });
  clock.advance(300);
  expect(fired).toEqual([
    { query: "re", at: 300 },
    { query: "rea", at: 1000 },
  ]);
  expect(scheduler.pending).toBeNull();
});

test("cancel drops the pending fire", () => {
  const clock = createManualClock();
  const fired: string[] = [];
  const scheduler = createDebounceScheduler(clock, (query) => {
    fired.push(query);
  });

  scheduler.arm("re", 300);
  clock.advance(150);
  expect(scheduler.pending).toEqual({ query: "re", fireAt: 300 });
  scheduler.cancel();
  expect(scheduler.pending).toBeNull();

  clock.advance(150);
  expect(clock.now()).toBe(300);
  expect(fired).toEqual([]);
});
