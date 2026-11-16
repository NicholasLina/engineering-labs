import { expect, test } from "vitest";
import { applySchedule, arrivalOrder, scenarios, type ScenarioId } from "./scenarios.ts";
import { settlementMayWrite, type SearchMode } from "./settlement.ts";

const modes: SearchMode[] = ["naive", "protected"];

test("the four schedules keep the search demo timings", () => {
  expect(scenarios.order.map((request) => [request.query, request.delayMs, request.fail])).toEqual([
    ["re", 600, false],
    ["rea", 50, false],
  ]);
  expect(scenarios.sequence.map((request) => [request.query, request.delayMs])).toEqual([
    ["re", 50],
    ["rea", 600],
  ]);
  expect(scenarios.error[0]).toMatchObject({ query: "re", delayMs: 600, fail: true, channel: "west" });
  expect(scenarios.error[1]).toMatchObject({ query: "rea", delayMs: 50, fail: false, channel: "east" });
  expect(scenarios.duplicate.map((request) => request.channel)).toEqual(["west", "west"]);
  expect(scenarios.duplicate.map((request) => [request.query, request.delayMs])).toEqual([
    ["re", 600],
    ["re", 50],
  ]);
});

test("arrival follows the shorter delay, then the lower id", () => {
  expect(arrivalOrder(scenarios.order).map((request) => request.id)).toEqual([2, 1]);
  expect(arrivalOrder(scenarios.sequence).map((request) => request.id)).toEqual([1, 2]);
  expect(arrivalOrder(scenarios.error).map((request) => request.id)).toEqual([2, 1]);
  expect(arrivalOrder(scenarios.duplicate).map((request) => request.id)).toEqual([2, 1]);
});

test("a stale success overwrites in naive mode and is ignored when protected", () => {
  const naive = applySchedule(scenarios.order, "naive");
  expect(naive.writes.map((write) => write.id)).toEqual([2, 1]);
  expect(naive.ignoredIds).toEqual([]);
  expect(naive.final).toEqual({ status: "success", query: "re", sourceId: 1 });

  const protectedMode = applySchedule(scenarios.order, "protected");
  expect(protectedMode.writes.map((write) => write.id)).toEqual([2]);
  expect(protectedMode.ignoredIds).toEqual([1]);
  expect(protectedMode.final).toEqual({ status: "success", query: "rea", sourceId: 2 });
});

test("a stale error replaces a newer success only in naive mode", () => {
  const naive = applySchedule(scenarios.error, "naive");
  expect(naive.writes.map((write) => [write.id, write.kind])).toEqual([
    [2, "success"],
    [1, "error"],
  ]);
  expect(naive.final).toEqual({ status: "error", sourceId: 1 });

  const protectedMode = applySchedule(scenarios.error, "protected");
  expect(protectedMode.ignoredIds).toEqual([1]);
  expect(protectedMode.final).toEqual({ status: "success", query: "rea", sourceId: 2 });
});

test("in-order and same-query endings follow the same write rule", () => {
  const sequenceNaive = applySchedule(scenarios.sequence, "naive");
  expect(sequenceNaive.writes.map((write) => write.id)).toEqual([1, 2]);
  expect(sequenceNaive.final).toEqual({ status: "success", query: "rea", sourceId: 2 });

  const sequenceProtected = applySchedule(scenarios.sequence, "protected");
  expect(sequenceProtected.ignoredIds).toEqual([1]);
  expect(sequenceProtected.final).toEqual({ status: "success", query: "rea", sourceId: 2 });

  const duplicateNaive = applySchedule(scenarios.duplicate, "naive");
  expect(duplicateNaive.final).toEqual({ status: "success", query: "re", sourceId: 1 });

  const duplicateProtected = applySchedule(scenarios.duplicate, "protected");
  expect(duplicateProtected.ignoredIds).toEqual([1]);
  expect(duplicateProtected.final).toEqual({ status: "success", query: "re", sourceId: 2 });
});

test("every schedule has a naive and a protected outcome", () => {
  const ids = Object.keys(scenarios) as ScenarioId[];
  expect(ids).toEqual(["order", "sequence", "error", "duplicate"]);
  for (const id of ids) {
    for (const mode of modes) {
      const outcome = applySchedule(scenarios[id], mode);
      expect(outcome.writes.length).toBeGreaterThan(0);
    }
  }
});

test("the write rule rejects an unmounted screen, a cleared epoch, and a stale protected id", () => {
  expect(
    settlementMayWrite({
      mounted: false,
      responseEpoch: 1,
      currentEpoch: 1,
      mode: "naive",
      responseId: 2,
      latestId: 2,
    }),
  ).toBe(false);
  expect(
    settlementMayWrite({
      mounted: true,
      responseEpoch: 1,
      currentEpoch: 2,
      mode: "protected",
      responseId: 4,
      latestId: 4,
    }),
  ).toBe(false);
  expect(
    settlementMayWrite({
      mounted: true,
      responseEpoch: 3,
      currentEpoch: 3,
      mode: "protected",
      responseId: 1,
      latestId: 2,
    }),
  ).toBe(false);
  expect(
    settlementMayWrite({
      mounted: true,
      responseEpoch: 3,
      currentEpoch: 3,
      mode: "naive",
      responseId: 1,
      latestId: 2,
    }),
  ).toBe(true);
});
