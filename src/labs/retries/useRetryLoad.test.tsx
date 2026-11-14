import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import { createManualClock } from "./clock.ts";
import { useRetryLoad, type RetryOptions } from "./useRetryLoad.ts";

const backoff: RetryOptions = { mode: "backoff", jitter: false };
const none: RetryOptions = { mode: "none", jitter: false };

function setup() {
  const clock = createManualClock();
  const view = renderHook(() => useRetryLoad(clock));
  return { clock, ...view };
}

test("backoff waits 200 ms and the next millisecond can succeed", () => {
  const { clock, result } = setup();

  act(() => {
    result.current.start("alpha", ["transient", "success"], backoff);
  });

  expect(result.current.logicalId).toBe(1);
  expect(result.current.query).toBe("alpha");
  expect(result.current.status).toBe("waiting");
  expect(result.current.waitMs).toBe(200);
  expect(result.current.result).toBeNull();
  expect(result.current.error).toBeNull();
  expect(result.current.attempts).toEqual([
    { logicalId: 1, attempt: 1, outcome: "transient", query: "alpha" },
  ]);

  act(() => {
    clock.advance(199);
  });
  expect(result.current.status).toBe("waiting");
  expect(result.current.attempts).toHaveLength(1);

  act(() => {
    clock.advance(1);
  });
  expect(result.current.status).toBe("success");
  expect(result.current.result).toBe("Loaded alpha");
  expect(result.current.error).toBeNull();
  expect(result.current.waitMs).toBeNull();
  expect(result.current.attempts).toEqual([
    { logicalId: 1, attempt: 1, outcome: "transient", query: "alpha" },
    { logicalId: 1, attempt: 2, outcome: "success", query: "alpha" },
  ]);

  act(() => {
    clock.advance(1000);
  });
  expect(result.current.attempts).toHaveLength(2);
});

test("three transient attempts fail and a further wait does not start a fourth", () => {
  const { clock, result } = setup();

  act(() => {
    result.current.start("alpha", ["transient", "transient", "transient"], backoff);
  });
  act(() => {
    clock.advance(200);
  });
  expect(result.current.attempts).toHaveLength(2);
  expect(result.current.status).toBe("waiting");
  expect(result.current.waitMs).toBe(400);

  act(() => {
    clock.advance(400);
  });
  expect(result.current.status).toBe("failed");
  expect(result.current.error).toBe("Transient failure.");
  expect(result.current.result).toBeNull();
  expect(result.current.waitMs).toBeNull();
  expect(result.current.attempts.map((attempt) => attempt.attempt)).toEqual([1, 2, 3]);
  expect(result.current.attempts.every((attempt) => attempt.outcome === "transient")).toBe(true);

  act(() => {
    clock.advance(800);
  });
  expect(result.current.attempts).toHaveLength(3);
  expect(result.current.status).toBe("failed");
});

test("a permanent failure in backoff mode stops on the first attempt", () => {
  const { clock, result } = setup();

  act(() => {
    result.current.start("alpha", ["permanent"], backoff);
  });

  expect(result.current.status).toBe("failed");
  expect(result.current.error).toBe("Permanent failure.");
  expect(result.current.waitMs).toBeNull();
  expect(result.current.attempts).toHaveLength(1);
  expect(result.current.attempts[0]?.outcome).toBe("permanent");

  act(() => {
    clock.advance(200);
  });
  expect(result.current.attempts).toHaveLength(1);
  expect(result.current.status).toBe("failed");
});

test("mode none stops a transient failure without arming a wait", () => {
  const { clock, result } = setup();

  act(() => {
    result.current.start("alpha", ["transient", "success"], none);
  });

  expect(result.current.status).toBe("failed");
  expect(result.current.error).toBe("Transient failure.");
  expect(result.current.waitMs).toBeNull();
  expect(result.current.attempts).toHaveLength(1);

  act(() => {
    clock.advance(1000);
  });
  expect(result.current.attempts).toHaveLength(1);
  expect(result.current.result).toBeNull();
});

test("a newer start in the same turn keeps its result after the old wait elapses", () => {
  const { clock, result } = setup();

  act(() => {
    result.current.start("alpha", ["transient", "success"], backoff);
    result.current.start("beta", ["success"], backoff);
  });

  expect(result.current.status).toBe("success");
  expect(result.current.result).toBe("Loaded beta");
  expect(result.current.query).toBe("beta");
  expect(result.current.logicalId).toBe(2);
  expect(result.current.attempts).toEqual([
    { logicalId: 1, attempt: 1, outcome: "transient", query: "alpha" },
    { logicalId: 2, attempt: 1, outcome: "success", query: "beta" },
  ]);

  act(() => {
    clock.advance(1000);
  });
  expect(result.current.result).toBe("Loaded beta");
  expect(result.current.status).toBe("success");
  expect(result.current.attempts.filter((attempt) => attempt.query === "alpha")).toHaveLength(1);
  expect(result.current.attempts.filter((attempt) => attempt.query === "beta")).toHaveLength(1);
});

test("clear wipes the log and a late timer does not add an attempt", () => {
  const { clock, result } = setup();

  act(() => {
    result.current.start("alpha", ["transient", "success"], backoff);
    result.current.clear();
  });

  expect(result.current.status).toBe("idle");
  expect(result.current.attempts).toHaveLength(0);
  expect(result.current.logicalId).toBeNull();
  expect(result.current.query).toBe("");
  expect(result.current.waitMs).toBeNull();
  expect(result.current.result).toBeNull();
  expect(result.current.error).toBeNull();

  act(() => {
    clock.advance(1000);
  });
  expect(result.current.status).toBe("idle");
  expect(result.current.attempts).toHaveLength(0);

  act(() => {
    result.current.start("beta", ["success"], backoff);
  });
  expect(result.current.result).toBe("Loaded beta");
  act(() => {
    clock.advance(1000);
  });
  expect(result.current.attempts).toHaveLength(1);
  expect(result.current.result).toBe("Loaded beta");
});

test("clear after the wait is visible stays idle when the timer would have fired", () => {
  const { clock, result } = setup();

  act(() => {
    result.current.start("alpha", ["transient", "success"], backoff);
  });
  expect(result.current.status).toBe("waiting");

  act(() => {
    result.current.clear();
  });
  expect(result.current.status).toBe("idle");
  expect(result.current.attempts).toHaveLength(0);

  act(() => {
    clock.advance(1000);
  });
  expect(result.current.status).toBe("idle");
  expect(result.current.attempts).toHaveLength(0);
});

test("unmount while waiting does not throw when the clock advances", () => {
  const { clock, result, unmount } = setup();

  act(() => {
    result.current.start("alpha", ["transient", "success"], backoff);
  });
  expect(result.current.status).toBe("waiting");
  unmount();

  expect(() => {
    act(() => {
      clock.advance(1000);
    });
  }).not.toThrow();
});

test("two fresh jitter runs schedule the same waits from seed 1", () => {
  function waits(): [number | null, number | null] {
    const clock = createManualClock();
    const { result, unmount } = renderHook(() => useRetryLoad(clock));
    act(() => {
      result.current.start("alpha", ["transient", "transient", "transient"], {
        mode: "backoff",
        jitter: true,
      });
    });
    const first = result.current.waitMs;
    act(() => {
      clock.advance(first ?? 0);
    });
    const second = result.current.waitMs;
    unmount();
    return [first, second];
  }

  const left = waits();
  const right = waits();
  expect(left).toEqual(right);
  expect(left[0]).not.toBeNull();
  expect(Number.isInteger(left[0])).toBe(true);
  expect(left[0] ?? -1).toBeGreaterThanOrEqual(0);
  expect(left[0] ?? 200).toBeLessThan(200);
  expect(left[1] ?? 400).toBeGreaterThanOrEqual(0);
  expect(left[1] ?? 400).toBeLessThan(400);
});

test("the attempt log keeps the latest 50 records", () => {
  const { result } = setup();

  act(() => {
    for (let index = 0; index < 51; index += 1) {
      result.current.start(`q${index}`, ["success"], none);
    }
  });

  expect(result.current.attempts).toHaveLength(50);
  expect(result.current.attempts[0]?.logicalId).toBe(2);
  expect(result.current.attempts[0]?.query).toBe("q1");
  expect(result.current.attempts.at(-1)?.logicalId).toBe(51);
  expect(result.current.result).toBe("Loaded q50");
});
