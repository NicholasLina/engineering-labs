import { expect, test } from "vitest";
import { createManualClock } from "./clock.ts";

test("fires due timers in time order, then registration order", () => {
  const clock = createManualClock();
  const order: string[] = [];

  clock.schedule(() => {
    order.push("late");
  }, 10);
  clock.schedule(() => {
    order.push("early");
  }, 5);
  clock.schedule(() => {
    order.push("late-again");
  }, 10);

  clock.advance(4);
  expect(order).toEqual([]);
  expect(clock.now()).toBe(4);

  clock.advance(6);
  expect(order).toEqual(["early", "late", "late-again"]);
  expect(clock.now()).toBe(10);
});

test("runs a timer armed by a callback when that timer is due", () => {
  const clock = createManualClock();
  const order: string[] = [];

  clock.schedule(() => {
    order.push("outer");
    clock.schedule(() => {
      order.push("inner");
    }, 0);
    clock.schedule(() => {
      order.push("after-target");
    }, 20);
  }, 5);
  clock.schedule(() => {
    order.push("later");
  }, 10);

  clock.advance(10);
  expect(order).toEqual(["outer", "inner", "later"]);

  clock.advance(20);
  expect(order).toEqual(["outer", "inner", "later", "after-target"]);
});

test("cancel keeps a timer from firing, including a second cancel", () => {
  const clock = createManualClock();
  const order: string[] = [];
  const cancel = clock.schedule(() => {
    order.push("cancelled");
  }, 5);
  clock.schedule(() => {
    order.push("kept");
  }, 5);

  cancel();
  cancel();
  clock.advance(5);
  expect(order).toEqual(["kept"]);
});

test("delay-0 timers fire in registration order on advance(0)", () => {
  const clock = createManualClock();
  const order: string[] = [];
  clock.schedule(() => {
    order.push("first");
  }, 0);
  clock.schedule(() => {
    order.push("second");
  }, 0);

  clock.advance(0);
  expect(order).toEqual(["first", "second"]);
  expect(clock.now()).toBe(0);
});
