import { expect, test, vi } from "vitest";
import { createManualClock, createWallClock } from "./clock.ts";

test("advance fires due timers in time order and moves now to the target", () => {
  const clock = createManualClock();
  const order: string[] = [];
  clock.schedule(30, () => order.push("late"));
  clock.schedule(10, () => order.push("early"));

  clock.advance(9);
  expect(order).toEqual([]);
  expect(clock.now()).toBe(9);

  clock.advance(21);
  expect(order).toEqual(["early", "late"]);
  expect(clock.now()).toBe(30);
});

test("equal due times fire in schedule order", () => {
  const clock = createManualClock();
  const order: number[] = [];
  clock.schedule(10, () => order.push(1));
  clock.schedule(10, () => order.push(2));
  clock.advance(10);
  expect(order).toEqual([1, 2]);
});

test("a follow-up timer fires in the same advance only when it is due", () => {
  const clock = createManualClock();
  const order: string[] = [];
  clock.schedule(300, () => {
    order.push("300");
    clock.schedule(50, () => order.push("350"));
    clock.schedule(200, () => order.push("500"));
  });
  clock.schedule(100, () => order.push("100"));

  clock.advance(200);
  expect(order).toEqual(["100"]);
  expect(clock.now()).toBe(200);

  clock.advance(200);
  expect(order).toEqual(["100", "300", "350"]);
  expect(clock.now()).toBe(400);
});

test("cancel removes a timer and a zero delay waits for advance(0)", () => {
  const clock = createManualClock(5);
  const calls: string[] = [];
  const cancelled = clock.schedule(0, () => calls.push("cancelled"));
  clock.schedule(0, () => calls.push(`kept@${clock.now()}`));
  clock.cancel(cancelled);

  expect(calls).toEqual([]);
  clock.advance(0);
  expect(calls).toEqual(["kept@5"]);
  expect(clock.now()).toBe(5);

  clock.advance(-3);
  expect(clock.now()).toBe(5);
});

test("the wall clock schedules on the host timer and cancel prevents the callback", () => {
  vi.useFakeTimers();
  try {
    const clock = createWallClock();
    const calls: string[] = [];
    const cancelled = clock.schedule(50, () => calls.push("cancelled"));
    clock.schedule(50, () => calls.push("fired"));
    clock.cancel(cancelled);
    expect(typeof clock.now()).toBe("number");

    vi.advanceTimersByTime(49);
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual(["fired"]);
  } finally {
    vi.useRealTimers();
  }
});
