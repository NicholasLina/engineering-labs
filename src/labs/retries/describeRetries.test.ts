import { expect, test } from "vitest";
import { describeRetries } from "./describeRetries.ts";
import type { RetryState } from "./useRetryLoad.ts";

const idle: RetryState = {
  logicalId: null,
  query: "",
  status: "idle",
  attempts: [],
  waitMs: null,
  result: null,
  error: null,
};

test("idle explains that no load has started", () => {
  const copy = describeRetries(idle);

  expect(copy.happened).toBe("No load has started yet.");
  expect(copy.request).toContain("none");
  expect(copy.attempts).toContain("0");
  expect(copy.attempts).toContain("classify");
  expect(copy.wait).toBe("No retry is waiting.");
  expect(copy.outcome).toContain("Idle");
});

test("a waiting retry names the logical id, the latest classification, and the wait", () => {
  const copy = describeRetries({
    logicalId: 1,
    query: "alpha",
    status: "waiting",
    attempts: [{ logicalId: 1, attempt: 1, outcome: "transient", query: "alpha" }],
    waitMs: 200,
    result: null,
    error: null,
  });

  expect(copy.happened).toContain("alpha");
  expect(copy.happened).toContain("200");
  expect(copy.request).toContain("Logical request 1");
  expect(copy.request).toContain("alpha");
  expect(copy.attempts).toContain("1 attempt");
  expect(copy.attempts).toContain("transient");
  expect(copy.wait).toBe("Waiting 200 ms.");
  expect(copy.outcome).toContain("Waiting");
  expect(copy.outcome).toContain("No final outcome");
});

test("a permanent stop names that failure and does not say it was retried", () => {
  const copy = describeRetries({
    logicalId: 4,
    query: "alpha",
    status: "failed",
    attempts: [{ logicalId: 4, attempt: 1, outcome: "permanent", query: "alpha" }],
    waitMs: null,
    result: null,
    error: "Permanent failure.",
  });

  expect(copy.happened).toContain("alpha");
  expect(copy.happened).toContain("permanent");
  expect(copy.happened.toLowerCase()).not.toContain("retried");
  expect(copy.request).toContain("Logical request 4");
  expect(copy.attempts).toContain("1 attempt");
  expect(copy.attempts).toContain("permanent");
  expect(copy.wait).toBe("No retry is waiting.");
  expect(copy.outcome).toContain("Permanent failure.");
});

test("a superseded result talks about the current query", () => {
  const copy = describeRetries({
    logicalId: 2,
    query: "beta",
    status: "success",
    attempts: [
      { logicalId: 1, attempt: 1, outcome: "transient", query: "alpha" },
      { logicalId: 2, attempt: 1, outcome: "success", query: "beta" },
    ],
    waitMs: null,
    result: "Loaded beta",
    error: null,
  });

  expect(copy.happened).toContain("beta");
  expect(copy.happened).toContain("Loaded beta");
  expect(copy.happened).not.toContain("alpha");
  expect(copy.request).toContain("Logical request 2");
  expect(copy.request).toContain("beta");
  expect(copy.request).not.toContain("alpha");
  expect(copy.attempts).toContain("2 attempts");
  expect(copy.attempts).toContain("success");
  expect(copy.wait).toBe("No retry is waiting.");
  expect(copy.outcome).toContain("Loaded beta");
});
