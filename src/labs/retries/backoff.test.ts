import { expect, test, vi } from "vitest";
import {
  backoffBaseMs,
  backoffCapMs,
  jitterSeed,
  maxAttempts,
  mulberry32,
  waitBeforeAttempt,
} from "./backoff.ts";

test("waits 200 then 400 and caps a later attempt at 800", () => {
  const random = () => {
    throw new Error("jitter off must not draw a random number");
  };

  expect(maxAttempts).toBe(3);
  expect(backoffBaseMs).toBe(200);
  expect(backoffCapMs).toBe(800);
  expect(jitterSeed).toBe(1);
  expect(waitBeforeAttempt(2, false, random)).toBe(200);
  expect(waitBeforeAttempt(3, false, random)).toBe(400);
  expect(waitBeforeAttempt(4, false, random)).toBe(800);
  expect(waitBeforeAttempt(5, false, random)).toBe(800);
});

test("jitter off does not call random", () => {
  const random = vi.fn(() => 0.5);

  expect(waitBeforeAttempt(2, false, random)).toBe(200);
  expect(waitBeforeAttempt(3, false, random)).toBe(400);
  expect(waitBeforeAttempt(4, false, random)).toBe(800);
  expect(random).not.toHaveBeenCalled();
});

test("seeded full jitter is a stable integer inside the delay", () => {
  const predicted = Math.floor(mulberry32(jitterSeed)() * 200);
  const first = waitBeforeAttempt(2, true, mulberry32(jitterSeed));
  const second = waitBeforeAttempt(2, true, mulberry32(jitterSeed));

  expect(first).toBe(predicted);
  expect(second).toBe(first);
  expect(Number.isInteger(first)).toBe(true);
  expect(first).toBeGreaterThanOrEqual(0);
  expect(first).toBeLessThan(200);

  const left = mulberry32(jitterSeed);
  const right = mulberry32(jitterSeed);
  expect(waitBeforeAttempt(3, true, left)).toBe(waitBeforeAttempt(3, true, right));
  expect(waitBeforeAttempt(3, true, left)).toBe(waitBeforeAttempt(3, true, right));

  const draws = vi.fn(() => 0.25);
  expect(waitBeforeAttempt(1, true, draws)).toBe(0);
  expect(draws).toHaveBeenCalledTimes(1);
  expect(waitBeforeAttempt(2, true, () => 0)).toBe(0);
});
