import { expect, test } from "vitest";
import { buildSaveTimeline, saveLaneColor, type SaveSpan } from "./timeline.ts";

function span(overrides: Partial<SaveSpan> & Pick<SaveSpan, "id" | "delayMs" | "startedAtMs">): SaveSpan {
  return {
    taskId: "brief",
    title: "Draft the brief",
    outcome: "pending",
    ...overrides,
  };
}

test("save colours come from the shared lane tokens", () => {
  expect(saveLaneColor(1)).toBe("var(--lane-1)");
  expect(saveLaneColor(8)).toBe("var(--lane-8)");
  expect(saveLaneColor(9)).toBe("var(--lane-1)");
});

test("bar length is the scheduled delay", () => {
  const timeline = buildSaveTimeline([
    span({ id: 1, startedAtMs: 0, delayMs: 1600 }),
    span({ id: 2, taskId: "samples", title: "Label the samples", startedAtMs: 0, delayMs: 400 }),
  ]);

  expect(timeline.spanMs).toBe(1600);
  expect(timeline.bars[0]?.widthPct).toBe(100);
  expect(timeline.bars[1]?.widthPct).toBe(25);
});

test("changing the outcome does not move the bar", () => {
  const pending = buildSaveTimeline([span({ id: 1, startedAtMs: 0, delayMs: 700 })]);
  const rejected = buildSaveTimeline([
    span({ id: 1, startedAtMs: 0, delayMs: 700, outcome: "rejected" }),
  ]);

  expect(rejected.bars[0]?.startPct).toBe(pending.bars[0]?.startPct);
  expect(rejected.bars[0]?.widthPct).toBe(pending.bars[0]?.widthPct);
  expect(rejected.bars[0]?.outcome).toBe("rejected");
});
