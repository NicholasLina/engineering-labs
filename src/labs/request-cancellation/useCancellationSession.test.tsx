import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import type { CatalogItem } from "./catalog.ts";
import { createManualClock, type ManualClock } from "./clock.ts";
import { createAbortableSearch, type SearchFn, type SearchParams } from "./simulateSearch.ts";
import { useCancellationSession, type CancellationMode } from "./useCancellationSession.ts";

const reactItem = { id: "react", label: "react" };
const broadMatch = [
  reactItem,
  { id: "redux", label: "redux" },
  { id: "relay", label: "relay" },
  { id: "rest", label: "rest" },
  { id: "rendering", label: "rendering" },
];

function setup(mode: CancellationMode) {
  const clock = createManualClock();
  const inner = createAbortableSearch(clock);
  const signals: AbortSignal[] = [];
  const search: SearchFn = (params) => {
    signals.push(params.signal);
    return inner(params);
  };
  const rendered = renderHook(
    ({ currentMode }: { currentMode: CancellationMode }) =>
      useCancellationSession({ search, clock, mode: currentMode }),
    { initialProps: { currentMode: mode } },
  );
  return { clock, signals, ...rendered };
}

function eventNames(log: readonly { id: number; event: string }[]): string[] {
  return log.map((entry) => `${entry.id}:${entry.event}`);
}

function lifetime(record: { startedAt: number; endedAt: number | null } | undefined): number | null {
  if (!record || record.endedAt === null) {
    return null;
  }
  return record.endedAt - record.startedAt;
}

test("ignore mode keeps both signals alive and drops the late write", () => {
  const { result, clock, signals } = setup("ignore");

  act(() => {
    result.current.search("re", { delayMs: 600, fail: false });
    result.current.search("rea", { delayMs: 80, fail: false });
  });

  expect(signals[0]?.aborted).toBe(false);
  expect(signals[1]?.aborted).toBe(false);
  expect(eventNames(result.current.log)).toEqual(["1:started", "2:started"]);

  act(() => {
    clock.advance(600);
  });

  expect(signals[0]?.aborted).toBe(false);
  expect(signals[1]?.aborted).toBe(false);
  expect(result.current.status).toBe("success");
  expect(result.current.resultsQuery).toBe("rea");
  expect(result.current.results).toEqual([reactItem]);
  expect(result.current.requests[0]).toMatchObject({
    outcome: "completed",
    write: "ignored",
    plannedMs: 600,
  });
  expect(result.current.requests[1]).toMatchObject({
    outcome: "completed",
    write: "applied",
    plannedMs: 80,
  });
  expect(lifetime(result.current.requests[0])).toBe(600);
  expect(lifetime(result.current.requests[1])).toBe(80);
  expect(eventNames(result.current.log)).toEqual([
    "1:started",
    "2:started",
    "2:completed",
    "1:completed",
    "1:ignored",
  ]);
});

test("abort mode aborts the previous signal and does not apply its result", () => {
  const { result, clock, signals } = setup("abort");

  act(() => {
    result.current.search("re", { delayMs: 600, fail: false });
    result.current.search("rea", { delayMs: 80, fail: false });
  });

  expect(signals[0]?.aborted).toBe(true);
  expect(signals[1]?.aborted).toBe(false);
  expect(result.current.requests[0]?.outcome).toBe("aborted");
  expect(eventNames(result.current.log)).toEqual([
    "1:started",
    "1:abort-requested",
    "1:aborted",
    "2:started",
  ]);

  act(() => {
    clock.advance(600);
  });

  expect(result.current.status).toBe("success");
  expect(result.current.resultsQuery).toBe("rea");
  expect(result.current.results).toEqual([reactItem]);
  expect(result.current.requests[0]?.outcome).toBe("aborted");
  expect(result.current.errorMessage).toBeNull();
  expect(eventNames(result.current.log)).toEqual([
    "1:started",
    "1:abort-requested",
    "1:aborted",
    "2:started",
    "2:completed",
  ]);
});

test("cancel before the timer aborts with a zero lifetime and does not resolve later", () => {
  const { result, clock, signals } = setup("abort");

  act(() => {
    result.current.search("re", { delayMs: 600, fail: false });
    result.current.cancel();
  });

  expect(signals[0]?.aborted).toBe(true);
  expect(result.current.status).toBe("idle");
  expect(result.current.results).toEqual([]);
  expect(result.current.errorMessage).toBeNull();
  expect(result.current.requests[0]).toMatchObject({ outcome: "aborted", plannedMs: 600 });
  expect(lifetime(result.current.requests[0])).toBe(0);
  expect(eventNames(result.current.log)).toEqual(["1:started", "1:abort-requested", "1:aborted"]);

  act(() => {
    clock.advance(600);
  });

  expect(result.current.status).toBe("idle");
  expect(result.current.results).toEqual([]);
  expect(eventNames(result.current.log)).toEqual(["1:started", "1:abort-requested", "1:aborted"]);
});

test("cancel after completion leaves the outcome completed", () => {
  const { result, clock } = setup("abort");

  act(() => {
    result.current.search("re", { delayMs: 0, fail: false });
  });
  act(() => {
    clock.advance(0);
  });

  expect(result.current.requests[0]?.outcome).toBe("completed");
  expect(result.current.results.map((item) => item.label)).toEqual(broadMatch.map((item) => item.label));

  act(() => {
    result.current.cancel();
  });

  expect(result.current.requests[0]?.outcome).toBe("completed");
  expect(result.current.requests[0]?.write).toBe("applied");
  expect(eventNames(result.current.log)).toEqual(["1:started", "1:completed"]);
});

test("a delay-0 completion scheduled before cancel settles first", () => {
  const { result, clock } = setup("abort");

  act(() => {
    result.current.search("re", { delayMs: 0, fail: false });
    clock.schedule(() => {
      result.current.cancel();
    }, 0);
    clock.advance(0);
  });

  expect(result.current.requests[0]?.outcome).toBe("completed");
  expect(result.current.status).toBe("success");
  expect(eventNames(result.current.log)).not.toContain("1:abort-requested");
  expect(eventNames(result.current.log)).not.toContain("1:aborted");
  expect(eventNames(result.current.log)).toEqual(["1:started", "1:completed"]);
});

test("clear during a pending ignore-mode request drops the later completion", () => {
  const { result, clock, signals } = setup("ignore");

  act(() => {
    result.current.search("re", { delayMs: 600, fail: false });
  });
  act(() => {
    result.current.clear();
  });

  expect(signals[0]?.aborted).toBe(false);
  expect(result.current.status).toBe("idle");
  expect(result.current.results).toEqual([]);
  expect(result.current.log).toEqual([]);
  expect(result.current.requests).toEqual([]);

  act(() => {
    clock.advance(600);
  });

  expect(result.current.status).toBe("idle");
  expect(result.current.results).toEqual([]);
  expect(result.current.log).toEqual([]);
  expect(result.current.requests).toEqual([]);
  expect(result.current.query).toBe("");
});

test("clear during a pending abort-mode request aborts the signal", () => {
  const { result, clock, signals } = setup("abort");

  act(() => {
    result.current.search("re", { delayMs: 600, fail: false });
  });
  act(() => {
    result.current.clear();
  });

  expect(signals[0]?.aborted).toBe(true);
  expect(result.current.status).toBe("idle");
  expect(result.current.log).toEqual([]);

  act(() => {
    clock.advance(600);
  });

  expect(result.current.status).toBe("idle");
  expect(result.current.results).toEqual([]);
  expect(result.current.log).toEqual([]);
  expect(result.current.requests).toEqual([]);
});

test("unmount does not throw", () => {
  const aborting = setup("abort");
  act(() => {
    aborting.result.current.search("re", { delayMs: 600, fail: false });
  });
  expect(() => {
    aborting.unmount();
  }).not.toThrow();
  expect(aborting.signals[0]?.aborted).toBe(true);
  expect(() => {
    act(() => {
      aborting.clock.advance(600);
    });
  }).not.toThrow();

  const ignoring = setup("ignore");
  act(() => {
    ignoring.result.current.search("re", { delayMs: 600, fail: false });
  });
  expect(() => {
    ignoring.unmount();
  }).not.toThrow();
  expect(ignoring.signals[0]?.aborted).toBe(false);
  expect(() => {
    act(() => {
      ignoring.clock.advance(600);
    });
  }).not.toThrow();
});

test("the current failure is Search failed and is not aborted", () => {
  const { result, clock } = setup("abort");

  act(() => {
    result.current.search("re", { delayMs: 10, fail: true });
  });
  act(() => {
    clock.advance(10);
  });

  expect(result.current.status).toBe("error");
  expect(result.current.errorMessage).toBe("Search failed");
  expect(result.current.results).toEqual([]);
  expect(result.current.requests[0]?.outcome).toBe("failed");
  expect(result.current.requests[0]?.outcome).not.toBe("aborted");
  expect(eventNames(result.current.log)).toEqual(["1:started", "1:failed"]);
});

test("a stale failure in ignore mode does not replace a newer success", () => {
  const { result, clock, signals } = setup("ignore");

  act(() => {
    result.current.search("re", { delayMs: 600, fail: true });
    result.current.search("rea", { delayMs: 80, fail: false });
  });
  act(() => {
    clock.advance(600);
  });

  expect(signals[0]?.aborted).toBe(false);
  expect(result.current.status).toBe("success");
  expect(result.current.results).toEqual([reactItem]);
  expect(result.current.resultsQuery).toBe("rea");
  expect(result.current.errorMessage).toBeNull();
  expect(result.current.requests[0]).toMatchObject({ outcome: "failed", write: "ignored" });
  expect(eventNames(result.current.log)).toEqual([
    "1:started",
    "2:started",
    "2:completed",
    "1:failed",
    "1:ignored",
  ]);
});

test("ignore mode cancel retires the id without aborting", () => {
  const { result, clock, signals } = setup("ignore");

  act(() => {
    result.current.search("re", { delayMs: 600, fail: false });
    result.current.cancel();
  });

  expect(signals[0]?.aborted).toBe(false);
  expect(result.current.status).toBe("idle");
  expect(result.current.requests[0]?.outcome).toBe("pending");
  expect(eventNames(result.current.log)).toEqual(["1:started"]);

  act(() => {
    clock.advance(600);
  });

  expect(signals[0]?.aborted).toBe(false);
  expect(result.current.status).toBe("idle");
  expect(result.current.results).toEqual([]);
  expect(result.current.requests[0]).toMatchObject({ outcome: "completed", write: "ignored" });
  expect(lifetime(result.current.requests[0])).toBe(600);
  expect(eventNames(result.current.log)).toEqual(["1:started", "1:completed", "1:ignored"]);
});

test("cancelling the current request restores an older applied result", () => {
  const { result, clock } = setup("abort");

  act(() => {
    result.current.search("rea", { delayMs: 0, fail: false });
    clock.advance(0);
  });
  expect(result.current.results).toEqual([reactItem]);

  act(() => {
    result.current.search("re", { delayMs: 600, fail: false });
    result.current.cancel();
  });

  expect(result.current.status).toBe("success");
  expect(result.current.resultsQuery).toBe("rea");
  expect(result.current.results).toEqual([reactItem]);
  expect(result.current.requests[1]?.outcome).toBe("aborted");
  expect(result.current.errorMessage).toBeNull();
});

test("a resolve that arrives after abort is still ignored", async () => {
  const clock = createManualClock();
  const calls: {
    params: SearchParams;
    resolve: (items: CatalogItem[]) => void;
  }[] = [];
  const search: SearchFn = (params) =>
    new Promise((resolve) => {
      calls.push({ params, resolve });
    });
  const { result } = renderHook(() => useCancellationSession({ search, clock, mode: "abort" }));

  act(() => {
    result.current.search("re", { delayMs: 600, fail: false });
    result.current.search("rea", { delayMs: 80, fail: false });
  });

  expect(calls[0]?.params.signal.aborted).toBe(true);
  expect(calls[1]?.params.signal.aborted).toBe(false);

  await act(async () => {
    calls[0]?.resolve(broadMatch);
  });

  expect(result.current.results).toEqual([]);
  expect(result.current.status).toBe("loading");
  expect(result.current.requests[0]).toMatchObject({ outcome: "completed", write: "ignored" });
  expect(eventNames(result.current.log)).toContain("1:completed");
  expect(eventNames(result.current.log)).toContain("1:ignored");
  expect(eventNames(result.current.log)).not.toContain("1:aborted");
});

test("an empty match is a completed write", () => {
  const { result, clock } = setup("ignore");

  act(() => {
    result.current.search("zzz", { delayMs: 0, fail: false });
    clock.advance(0);
  });

  expect(result.current.status).toBe("empty");
  expect(result.current.resultsQuery).toBe("zzz");
  expect(result.current.results).toEqual([]);
  expect(result.current.requests[0]).toMatchObject({ outcome: "completed", write: "applied" });
});

test("a blank query clears the session", () => {
  const { result, signals } = setup("abort");

  act(() => {
    result.current.search("re", { delayMs: 600, fail: false });
    result.current.search("   ", { delayMs: 10, fail: false });
  });

  expect(signals[0]?.aborted).toBe(true);
  expect(result.current.status).toBe("idle");
  expect(result.current.query).toBe("");
  expect(result.current.log).toEqual([]);
});

test("cancel with nothing in flight is a no-op", () => {
  const { result, clock } = setup("ignore");

  act(() => {
    result.current.cancel();
  });
  expect(result.current.log).toEqual([]);

  act(() => {
    result.current.search("re", { delayMs: 0, fail: false });
    clock.advance(0);
    result.current.cancel();
  });

  expect(result.current.requests[0]?.outcome).toBe("completed");
  expect(eventNames(result.current.log)).toEqual(["1:started", "1:completed"]);
});

test("the log keeps the latest 50 entries", () => {
  const { result } = setup("ignore");

  act(() => {
    for (let index = 0; index < 60; index += 1) {
      result.current.search(`q${index}`, { delayMs: 10, fail: false });
    }
  });

  expect(result.current.log).toHaveLength(50);
  expect(result.current.log[0]?.id).toBe(11);
  expect(result.current.log.at(-1)?.id).toBe(60);
  expect(result.current.log.at(-1)?.event).toBe("started");
});

function advanceQuietly(clock: ManualClock, ms: number) {
  act(() => {
    clock.advance(ms);
  });
}

test("cancel after the work has finished does not append abort events in ignore mode", () => {
  const { result, clock } = setup("ignore");
  act(() => {
    result.current.search("rea", { delayMs: 0, fail: false });
  });
  advanceQuietly(clock, 0);
  act(() => {
    result.current.cancel();
  });
  expect(result.current.requests[0]?.outcome).toBe("completed");
  expect(eventNames(result.current.log)).toEqual(["1:started", "1:completed"]);
});
