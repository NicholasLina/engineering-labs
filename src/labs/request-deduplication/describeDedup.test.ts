import { expect, test } from "vitest";
import { describeDedup } from "./describeDedup.ts";
import type { PoolState } from "./inflightPool.ts";

function idleState(): PoolState {
  return {
    consumers: {
      a: { key: "", phase: "idle", value: "", error: "" },
      b: { key: "", phase: "idle", value: "", error: "" },
    },
    transports: [],
    inflightKeys: [],
  };
}

test("idle copy says no request has started", () => {
  const copy = describeDedup(idleState());
  expect(copy.happened).toBe("No request has started yet.");
  expect(copy.inflight).toBe("Nothing is in flight.");
});

test("two consumers on one transport are described as one transport request", () => {
  const state: PoolState = {
    consumers: {
      a: { key: "atlas", phase: "pending", value: "", error: "" },
      b: { key: "atlas", phase: "pending", value: "", error: "" },
    },
    transports: [{ id: 1, key: "atlas", phase: "pending", consumers: ["a", "b"] }],
    inflightKeys: ["atlas"],
  };

  const copy = describeDedup(state);
  expect(copy.happened).toContain("1 transport request");
  expect(copy.happened).not.toContain("2 transport requests");
  expect(copy.happened).toMatch(/both consumers/i);
  expect(copy.consumers).toMatch(/A is pending on atlas/);
  expect(copy.consumers).toMatch(/B is pending on atlas/);
  expect(copy.inflight).toBe("In flight: atlas.");
});

test("a failure that left nothing in flight says the next caller starts new work", () => {
  const state: PoolState = {
    consumers: {
      a: { key: "atlas", phase: "error", value: "", error: "Request failed" },
      b: { key: "atlas", phase: "error", value: "", error: "Request failed" },
    },
    transports: [{ id: 1, key: "atlas", phase: "failed", consumers: ["a", "b"] }],
    inflightKeys: [],
  };

  const copy = describeDedup(state);
  expect(copy.happened).toContain("1 transport request");
  expect(copy.happened).toMatch(/failed/i);
  expect(copy.happened).toMatch(/nothing is in flight/i);
  expect(copy.inflight).toBe("Nothing is in flight.");
});

test("two transports use the plural phrase", () => {
  const state: PoolState = {
    consumers: {
      a: { key: "atlas", phase: "pending", value: "", error: "" },
      b: { key: "borealis", phase: "pending", value: "", error: "" },
    },
    transports: [
      { id: 1, key: "atlas", phase: "pending", consumers: ["a"] },
      { id: 2, key: "borealis", phase: "pending", consumers: ["b"] },
    ],
    inflightKeys: ["atlas", "borealis"],
  };

  expect(describeDedup(state).happened).toContain("2 transport requests");
});
