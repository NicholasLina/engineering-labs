import { expect, test } from "vitest";
import { applySchedule, scenarios, type ScenarioId, type ScenarioRequest } from "./scenarios.ts";
import type { ScheduleOutcome } from "./scenarios.ts";
import {
  acknowledgementFor,
  frameFor,
  guidedHarbour,
  guidedStepIndex,
  harbourStory,
  lighthouseRules,
  lighthouseSceneCopy,
  raceConditionCopy,
  scheduleArrivalIds,
  storyArrivalIds,
  westSlip,
  type HarbourFrame,
  type HarbourStory,
} from "./harbour.ts";

const order = harbourStory("order");

if (!order) {
  throw new Error("Missing out-of-order story.");
}

test("the briefing names the race, the lighthouse, and the limits of the picture", () => {
  expect(raceConditionCopy).toMatch(/depends on timing/);
  expect(lighthouseSceneCopy).toMatch(/Imagine there is a lighthouse/);
  expect(lighthouseSceneCopy).toMatch(/far away source/);
  expect(lighthouseRules.join(" ")).toMatch(/does not, by itself, change the lamp/);
  expect(lighthouseRules.join(" ")).toMatch(/paper slip/);
  expect(lighthouseRules.join(" ")).toMatch(/not called back/);
});

test("the lighthouse starts with nobody sent", () => {
  const quiet = frameFor(order, 0);
  expect(order.steps[0]?.briefing).toBe(true);
  expect(quiet.assignment).toBe("No assignment");
  expect(quiet.signal).toBe("awaiting");
  expect(quiet.signalLabel).toBe("No signal yet");
  expect(quiet.producedBy).toBe("No report yet");
  expect(quiet.messengers).toEqual([]);
});

test("out of order reaches the door in the shared arrival order", () => {
  expect(storyArrivalIds(order, 5)).toEqual(scheduleArrivalIds("order"));
  expect(storyArrivalIds(order, 6)).toEqual([2, 1]);
});

test("the naive ending applies the late west card and the protected ending ignores it", () => {
  const naive = frameFor(order, 5);
  const guarded = frameFor(order, 6);
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
  const paused = frameFor(order, 4);
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
  const first = frameFor(order, 1);
  expect(first.assignment).toBe("#1 · West channel");
  expect(first.signal).toBe("awaiting");
  expect(first.producedBy).toBe("No report yet");
  expect(first.messengers.map((messenger) => [messenger.id, messenger.progress, messenger.route])).toEqual([
    [1, "en-route", "long"],
  ]);

  const second = frameFor(order, 2);
  expect(second.assignment).toBe("#2 · East channel");
  expect(second.signal).toBe("awaiting");
  expect(second.messengers.map((messenger) => [messenger.id, messenger.route, messenger.progress])).toEqual([
    [1, "long", "en-route"],
    [2, "short", "en-route"],
  ]);
});

function storyOrThrow(id: ScenarioId): HarbourStory {
  const story = harbourStory(id);
  if (!story) {
    throw new Error(`Missing ${id} story.`);
  }
  return story;
}

function expectSameEnding(frame: HarbourFrame, requests: readonly ScenarioRequest[], outcome: ScheduleOutcome) {
  expect(frame.producedBy).toBe(`#${outcome.final.sourceId}`);
  if (outcome.final.status === "error") {
    expect(frame.signal).toBe("dark");
  } else {
    const source = requests.find((request) => request.id === outcome.final.sourceId);
    expect(frame.signal).toBe(source?.channel === "west" ? "amber" : "blue");
  }
  expect(
    frame.messengers.filter((messenger) => messenger.progress === "set-aside").map((messenger) => messenger.id),
  ).toEqual(outcome.ignoredIds);
}

test("each variation arrives in schedule order and ends with the shared write rule", () => {
  for (const id of ["sequence", "error", "duplicate"] as const) {
    const story = storyOrThrow(id);
    const naiveIndex = story.steps.length - 2;
    const protectedIndex = story.steps.length - 1;
    expect(storyArrivalIds(story, naiveIndex)).toEqual(scheduleArrivalIds(id));
    expect(storyArrivalIds(story, protectedIndex)).toEqual(scheduleArrivalIds(id));
    expectSameEnding(frameFor(story, naiveIndex), scenarios[id], applySchedule(scenarios[id], "naive"));
    expectSameEnding(
      frameFor(story, protectedIndex),
      scenarios[id],
      applySchedule(scenarios[id], "protected"),
    );
  }
});

test("in order shows a wrong amber lamp before the later card covers it", () => {
  const story = storyOrThrow("sequence");
  const travelling = frameFor(story, 1);
  expect(travelling.signal).toBe("awaiting");
  expect(travelling.messengers.map((messenger) => [messenger.id, messenger.route])).toEqual([
    [1, "short"],
    [2, "long"],
  ]);

  const early = frameFor(story, 2);
  expect(early.assignment).toBe("#2 · East channel");
  expect(early.signal).toBe("amber");
  expect(early.producedBy).toBe("#1");

  const covered = frameFor(story, 3);
  expect(covered.signal).toBe("blue");
  expect(covered.producedBy).toBe("#2");

  const guarded = frameFor(story, 4);
  expect(guarded.signal).toBe("blue");
  expect(guarded.log).not.toContain("#1 · West · amber card · applied");
  expect(guarded.log).toContain("#1 · West · amber card · received and ignored");
});

test("a messenger who has not returned does not put the lamp out", () => {
  const story = storyOrThrow("error");
  const pending = frameFor(story, 1);
  expect(pending.signal).toBe("blue");
  expect(pending.messengers.find((messenger) => messenger.id === 1)).toMatchObject({
    progress: "en-route",
    carrying: "none",
  });

  const paused = frameFor(story, 2);
  expect(paused.signal).toBe("blue");
  expect(paused.messengers.find((messenger) => messenger.id === 1)).toMatchObject({
    progress: "door",
    carrying: "slip",
    slipText: westSlip,
  });
  expect(paused.log).toContain("#1 · West · failure slip · at the door");

  const applied = frameFor(story, 3);
  expect(applied.signal).toBe("dark");
  expect(applied.signalLabel).toBe("No signal");
  expect(applied.assignment).toBe("#2 · East channel");
  expect(applied.log).toContain("#1 · West · failure slip · applied");

  const guarded = frameFor(story, 4);
  expect(guarded.signal).toBe("blue");
  expect(guarded.log).toContain("#1 · West · failure slip · received and ignored");
  expect(acknowledgementFor(story, 3, { 2: "dark" })).toBe(
    "You chose dark. The keeper applies the slip, so the lamp goes dark while the assignment is still East.",
  );
  expect(acknowledgementFor(story, 3, { 2: "blue" })).toMatch(/does not check/);
});

test("same query keeps an amber lamp while the dispatch record changes", () => {
  const story = storyOrThrow("duplicate");
  const sent = frameFor(story, 1);
  expect(sent.assignment).toBe("#2 · West channel");
  expect(sent.messengers.every((messenger) => messenger.channel === "west")).toBe(true);

  const naive = frameFor(story, 2);
  expect(naive.signal).toBe("amber");
  expect(naive.producedBy).toBe("#1");
  expect(naive.log).toContain("#2 · West · amber card · applied");
  expect(naive.log).toContain("#1 · West · amber card · applied");

  const guarded = frameFor(story, 3);
  expect(guarded.signal).toBe("amber");
  expect(guarded.producedBy).toBe("#2");
  expect(guarded.log).toContain("#1 · West · amber card · received and ignored");
  expect(guarded.log).not.toContain("#1 · West · amber card · applied");
});

test("the guided harbour keeps the late card off the lamp until it is applied", () => {
  function frame(id: string) {
    return frameFor(guidedHarbour, guidedStepIndex(id));
  }

  expect(frame("meet-keeper").messengers).toEqual([]);
  expect(frame("assign-west").messengers).toEqual([]);
  expect(frame("assign-west").assignment).toBe("#1 · West channel");

  for (const id of ["messenger-1-away", "assignment-east", "replay-west", "replay-east-assigned"] as const) {
    const travelling = frame(id).messengers.find((messenger) => messenger.id === 1);
    expect(travelling).toMatchObject({ progress: "en-route", card: null, carrying: "none" });
  }

  expect(frame("assignment-east").messengers.map((messenger) => messenger.id)).toEqual([1]);
  expect(frame("assignment-east").assignment).toBe("#2 · East channel");
  expect(frame("messenger-2-away").messengers.every((messenger) => messenger.card === null)).toBe(true);

  const east = frame("east-applied");
  expect(east.signal).toBe("blue");
  expect(east.assignment).toBe("#2 · East channel");
  expect(east.messengers.find((messenger) => messenger.id === 1)?.card).toBeNull();

  const paused = frame("predict-late");
  expect(paused.signal).toBe("blue");
  expect(paused.assignment).toBe("#2 · East channel");
  expect(paused.messengers.find((messenger) => messenger.id === 1)).toMatchObject({
    progress: "door",
    card: "amber",
  });

  const late = frame("late-applied");
  expect(late.signal).toBe("amber");
  expect(late.assignment).toBe("#2 · East channel");
  expect(frame("predict-late").signal).toBe("blue");

  const replayAssigned = frame("replay-east-assigned");
  expect(replayAssigned.assignment).toBe("#2 · East channel");
  expect(replayAssigned.messengers.map((messenger) => messenger.id)).toEqual([1]);

  const tray = frame("replay-west-set-aside");
  expect(tray.signal).toBe("blue");
  expect(tray.producedBy).toBe("#2");
  expect(tray.setAside.map((messenger) => [messenger.id, messenger.card])).toEqual([[1, "amber"]]);
  expect(tray.log).toContain("#1 · West · amber card · received and ignored");
});

test("a prediction is remembered for the reveal step and cleared when absent", () => {
  expect(acknowledgementFor(order, 5, { 4: "amber" })).toBe(
    "You chose amber. The late card turns the lamp amber while the assignment is still East.",
  );
  expect(acknowledgementFor(order, 5, { 4: "blue" })).toMatch(/does not check/);
  expect(acknowledgementFor(order, 5, {})).toBeNull();
  expect(acknowledgementFor(order, 4, { 4: "amber" })).toBeNull();
});
