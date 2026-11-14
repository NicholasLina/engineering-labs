import { expect, test } from "vitest";
import { createManualClock } from "./clock.ts";

test("fires due timers in time then id order", () => {
  const clock = createManualClock();
  const order: string[] = [];
  clock.schedule(() => {
    order.push("third");
  }, 30);
  clock.schedule(() => {
    order.push("first");
  }, 10);
  clock.schedule(() => {
    order.push("second");
  }, 10);

  clock.advance(25);
  expect(order).toEqual(["first", "second"]);
  expect(clock.now()).toBe(25);

  clock.advance(5);
  expect(order).toEqual(["first", "second", "third"]);
  expect(clock.now()).toBe(30);
});

test("cancel removes a timer before it can fire", () => {
  const clock = createManualClock();
  const order: string[] = [];
  const cancel = clock.schedule(() => {
    order.push("dropped");
  }, 20);
  clock.schedule(() => {
    order.push("kept");
  }, 20);
  cancel();

  clock.advance(20);
  expect(order).toEqual(["kept"]);
  expect(clock.now()).toBe(20);
});

test("a timer scheduled by an earlier callback fires in the same advance when it is due", () => {
  const clock = createManualClock();
  const order: string[] = [];
  clock.schedule(() => {
    order.push("early");
    clock.schedule(() => {
      order.push("nested");
    }, 10);
  }, 5);
  clock.schedule(() => {
    order.push("late");
  }, 40);

  clock.advance(20);
  expect(order).toEqual(["early", "nested"]);
  expect(clock.now()).toBe(20);

  clock.advance(20);
  expect(order).toEqual(["early", "nested", "late"]);
  expect(clock.now()).toBe(40);
});
