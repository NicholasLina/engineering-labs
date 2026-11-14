import { expect, test } from "vitest";
import { createManualClock, createWallClock } from "./clock.ts";

test("manual clock fires due timers in registration order", () => {
  const clock = createManualClock();
  const order: string[] = [];

  clock.schedule(() => {
    order.push("late");
  }, 20);
  clock.schedule(() => {
    order.push("early");
  }, 10);
  clock.schedule(() => {
    order.push("also-early");
  }, 10);

  clock.advance(9);
  expect(order).toEqual([]);
  expect(clock.now()).toBe(9);

  clock.advance(11);
  expect(order).toEqual(["early", "also-early", "late"]);
  expect(clock.now()).toBe(20);
});

test("a cancelled timer does not run on a later advance", () => {
  const clock = createManualClock();
  const order: string[] = [];
  const cancel = clock.schedule(() => {
    order.push("cancelled");
  }, 10);
  clock.schedule(() => {
    order.push("kept");
  }, 10);

  cancel();
  clock.advance(10);
  clock.advance(10);

  expect(order).toEqual(["kept"]);
  expect(clock.now()).toBe(20);
});

test("wall clock schedule can be cancelled before it runs", () => {
  const clock = createWallClock();
  let ran = false;
  const cancel = clock.schedule(() => {
    ran = true;
  }, 10_000);

  cancel();

  expect(ran).toBe(false);
  expect(Math.abs(clock.now() - Date.now())).toBeLessThan(1_000);
});
