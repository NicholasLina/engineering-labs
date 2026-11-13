import { expect, test } from "vitest";
import { buildTimeline, requestLaneColor, type TimelineRequest } from "./timeline.ts";

function request(
  overrides: Partial<TimelineRequest> &
    Pick<TimelineRequest, "id" | "query" | "startedAtMs" | "delayMs">,
): TimelineRequest {
  return {
    outcome: "pending",
    ...overrides,
  };
}

test("series colours come from the shared lane tokens", () => {
  expect(requestLaneColor(1)).toBe("var(--lane-1)");
  expect(requestLaneColor(8)).toBe("var(--lane-8)");
  expect(requestLaneColor(9)).toBe("var(--lane-1)");
});

test("places equal starts on a span set by the longer delay", () => {
  const timeline = buildTimeline([
    request({ id: 1, query: "re", startedAtMs: 1_000, delayMs: 600 }),
    request({ id: 2, query: "rea", startedAtMs: 1_000, delayMs: 50 }),
  ]);

  expect(timeline.spanMs).toBe(600);
  expect(timeline.bars.map((bar) => bar.startPct)).toEqual([0, 0]);
  expect(timeline.bars[0]?.widthPct).toBe(100);
  expect(timeline.bars[1]?.widthPct).toBeCloseTo((50 / 600) * 100);
});

test("a later short request still ends before a longer one", () => {
  const timeline = buildTimeline([
    request({ id: 1, query: "re", startedAtMs: 0, delayMs: 600, outcome: "resolved" }),
    request({ id: 2, query: "rea", startedAtMs: 10, delayMs: 50, outcome: "resolved" }),
  ]);

  expect(timeline.spanMs).toBe(600);
  const short = timeline.bars[1];
  expect(short?.startPct).toBeCloseTo((10 / 600) * 100);
  expect(short?.widthPct).toBeCloseTo((50 / 600) * 100);
  expect((short?.startPct ?? 0) + (short?.widthPct ?? 0)).toBeLessThan(100);
});

test("a cache hit is a zero-width marker at its start", () => {
  const timeline = buildTimeline([
    request({ id: 1, query: "re", startedAtMs: 0, delayMs: 600, outcome: "resolved" }),
    request({ id: 2, query: "rea", startedAtMs: 100, delayMs: 0, outcome: "cache-hit" }),
  ]);

  expect(timeline.spanMs).toBe(600);
  expect(timeline.bars[1]).toMatchObject({
    outcome: "cache-hit",
    delayMs: 0,
    startPct: (100 / 600) * 100,
    widthPct: 0,
  });
});

test("a span of only cache hits has no duration", () => {
  const timeline = buildTimeline([
    request({ id: 1, query: "rea", startedAtMs: 40, delayMs: 0, outcome: "cache-hit" }),
    request({ id: 2, query: "rea", startedAtMs: 40, delayMs: 0, outcome: "cache-hit" }),
  ]);

  expect(timeline.spanMs).toBe(0);
  expect(timeline.bars).toEqual([
    { id: 1, query: "rea", delayMs: 0, outcome: "cache-hit", startPct: 0, widthPct: 0 },
    { id: 2, query: "rea", delayMs: 0, outcome: "cache-hit", startPct: 0, widthPct: 0 },
  ]);
});

test("changing the outcome does not move the bar", () => {
  const pending = buildTimeline([
    request({ id: 1, query: "re", startedAtMs: 0, delayMs: 600, outcome: "pending" }),
  ]);
  const ignored = buildTimeline([
    request({ id: 1, query: "re", startedAtMs: 0, delayMs: 600, outcome: "ignored" }),
  ]);

  expect(ignored.bars[0]?.startPct).toBe(pending.bars[0]?.startPct);
  expect(ignored.bars[0]?.widthPct).toBe(pending.bars[0]?.widthPct);
  expect(ignored.bars[0]?.outcome).toBe("ignored");
});

test("an empty request list has no span", () => {
  expect(buildTimeline([])).toEqual({ spanMs: 0, bars: [] });
});
