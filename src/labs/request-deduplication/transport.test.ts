import { expect, test } from "vitest";
import { createManualClock } from "./clock.ts";
import { createSimulatedTransport } from "./transport.ts";

test("resolves Record key after 400ms on the clock", () => {
  const clock = createManualClock();
  const transport = createSimulatedTransport(clock);
  const controller = new AbortController();
  let value = "";

  void transport({ key: "atlas", signal: controller.signal, fail: false }).then((next) => {
    value = next;
  });

  clock.advance(399);
  expect(value).toBe("");

  clock.advance(1);
  expect(value).toBe("Record atlas");
});

test("fail rejects with Request failed", () => {
  const clock = createManualClock();
  const transport = createSimulatedTransport(clock);
  const controller = new AbortController();
  let message = "";

  void transport({ key: "atlas", signal: controller.signal, fail: true }).then(
    () => {
      message = "resolved";
    },
    (error: unknown) => {
      message = error instanceof Error ? error.message : "other";
    },
  );

  clock.advance(400);
  expect(message).toBe("Request failed");
});

test("abort rejects with AbortError and a later advance does not resolve", () => {
  const clock = createManualClock();
  const transport = createSimulatedTransport(clock);
  const controller = new AbortController();
  const outcomes: string[] = [];

  void transport({ key: "atlas", signal: controller.signal, fail: false }).then(
    (value) => {
      outcomes.push(value);
    },
    (error: unknown) => {
      outcomes.push(error instanceof DOMException ? error.name : "other");
    },
  );

  controller.abort();
  expect(outcomes).toEqual(["AbortError"]);

  clock.advance(400);
  clock.advance(400);
  expect(outcomes).toEqual(["AbortError"]);
});

test("an already aborted signal rejects without waiting", () => {
  const clock = createManualClock();
  const transport = createSimulatedTransport(clock);
  const controller = new AbortController();
  controller.abort();
  let name = "";

  void transport({ key: "borealis", signal: controller.signal, fail: false }).then(
    () => {
      name = "resolved";
    },
    (error: unknown) => {
      name = error instanceof DOMException ? error.name : "other";
    },
  );

  expect(name).toBe("AbortError");
  clock.advance(400);
  expect(name).toBe("AbortError");
});
