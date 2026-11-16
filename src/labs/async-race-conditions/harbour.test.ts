import { expect, test } from "vitest";
import { applySchedule, scenarios } from "./scenarios.ts";
import {
  acknowledgementFor,
  frameFor,
  harbourStory,
  premiseCopy,
  scheduleArrivalIds,
  storyArrivalIds,
} from "./harbour.ts";

const order = harbourStory("order");

if (!order) {
  throw new Error("Missing out-of-order story.");
}

test("the premise names the keeper, the card, and a changed assignment", () => {
  expect(premiseCopy).toMatch(/whichever channel the keeper is assigned to/);
  expect(premiseCopy).toMatch(/right card for an assignment that has already changed/);
});

test("out of order reaches the door in the shared arrival order", () => {
  expect(storyArrivalIds(order, 4)).toEqual(scheduleArrivalIds("order"));
  expect(storyArrivalIds(order, 5)).toEqual([2, 1]);
});

test("the naive ending applies the late west card and the protected ending ignores it", () => {
  const naive = frameFor(order, 4);
  const guarded = frameFor(order, 5);
  const naiveOutcome = applySchedule(scenarios.order, "naive");
  const protectedOutcome = applySchedule(scenarios.order, "protected");

  expect(naive.assignment).toBe("#2 · East channel");
  expect(naive.signal).toBe("amber");
  expect(naive.producedBy).toBe(`#${naiveOutcome.final.sourceId}`);
  expect(naive.log).toContain("#1 · West · amber card · applied");

  expect(guarded.signal).toBe("blue");
  expect(guarded.producedBy).toBe(`#${protectedOutcome.final.sourceId}`);
  expect(guarded.log).toContain("#1 · West · amber card · received and ignored");
  expect(guarded.messengers.find((messenger) => messenger.id === 1)?.progress).toBe("set-aside");
});

test("the prediction step leaves the blue lamp in place", () => {
  const paused = frameFor(order, 3);
  expect(paused.signalLabel).toBe("Blue · East");
  expect(paused.producedBy).toBe("#2");
  expect(paused.messengers.find((messenger) => messenger.id === 1)).toMatchObject({
    progress: "door",
    card: "amber",
    route: "long",
  });
  expect(paused.messengers.find((messenger) => messenger.id === 2)?.progress).toBe("delivered");
  expect(paused.log).toContain("#1 · West · amber card · at the door");
  expect(paused.log).not.toContain("#1 · West · amber card · applied");
});

test("earlier steps keep the messenger that has not returned on the route", () => {
  const first = frameFor(order, 0);
  expect(first.assignment).toBe("#1 · West channel");
  expect(first.signal).toBe("awaiting");
  expect(first.producedBy).toBe("No report yet");
  expect(first.messengers.map((messenger) => [messenger.id, messenger.progress, messenger.route])).toEqual([
    [1, "en-route", "long"],
  ]);

  const second = frameFor(order, 1);
  expect(second.assignment).toBe("#2 · East channel");
  expect(second.signal).toBe("awaiting");
  expect(second.messengers.map((messenger) => [messenger.id, messenger.route, messenger.progress])).toEqual([
    [1, "long", "en-route"],
    [2, "short", "en-route"],
  ]);
});

test("a prediction is remembered for the reveal step and cleared when absent", () => {
  expect(acknowledgementFor(order, 4, { 3: "amber" })).toBe(
    "You chose amber. That is the card in the keeper's hand.",
  );
  expect(acknowledgementFor(order, 4, { 3: "blue" })).toMatch(/this keeper does not check/);
  expect(acknowledgementFor(order, 4, {})).toBeNull();
  expect(acknowledgementFor(order, 3, { 3: "amber" })).toBeNull();
});
