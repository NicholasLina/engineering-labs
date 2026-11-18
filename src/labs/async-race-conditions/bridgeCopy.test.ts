import { expect, test } from "vitest";
import { describeBridge, type BridgeRequest } from "./bridgeCopy.ts";
import { scenarios, type ScenarioId } from "./scenarios.ts";
import type { SearchMode } from "./settlement.ts";

function requestsFor(id: ScenarioId, outcomes: BridgeRequest["outcome"][]): BridgeRequest[] {
  return scenarios[id].map((request, index) => ({
    id: request.id,
    query: request.query,
    delayMs: request.delayMs,
    outcome: outcomes[index] ?? "pending",
  }));
}

function bridge(id: ScenarioId, mode: SearchMode, outcomes: BridgeRequest["outcome"][], resultsQuery = "") {
  return describeBridge({
    scenarioId: id,
    mode,
    query: scenarios[id][1]?.query ?? "",
    resultsQuery,
    requests: requestsFor(id, outcomes),
  });
}

test("out of order names the box, the replaced heading, and the protected heading", () => {
  const pending = bridge("order", "naive", ["pending", "pending"]);
  expect(pending?.happened).toMatch(/still travelling/);
  expect(pending?.search).toMatch(/logbook/);
  expect(pending?.search).toMatch(/request rows are the envelopes/);
  expect(pending?.timeline).toMatch(/not the signal colour/);

  const travelling = bridge("order", "naive", ["pending", "resolved"], "rea");
  expect(travelling?.happened).toMatch(/has not returned/);
  expect(travelling?.happened).toMatch(/heading can change/);

  const naive = bridge("order", "naive", ["resolved", "resolved"], "re");
  expect(naive?.happened).toMatch(/The box says rea/);
  expect(naive?.happened).toMatch(/Results for "re"/);
  expect(naive?.happened).toMatch(/older card/);
  expect(naive?.happened).toMatch(/rendered react/);
  expect(naive?.happened).toMatch(/Choose Protected/);

  const guarded = bridge("order", "protected", ["ignored", "resolved"], "rea");
  expect(guarded?.happened).toMatch(/heading stays Results for "rea"/);
  expect(guarded?.happened).toMatch(/cancel-requested when #2 started, then ignored/);
  expect(guarded?.requests).toMatch(/ignored/);
});

test("the other scenarios explain a hidden success, a stale failure, and a same-colour write", () => {
  const sequence = bridge("sequence", "naive", ["resolved", "resolved"], "rea");
  expect(sequence?.happened).toMatch(/open channel/);
  expect(sequence?.happened).toMatch(/Request #1 resolved first/);

  const sequenceGuarded = bridge("sequence", "protected", ["ignored", "resolved"], "rea");
  expect(sequenceGuarded?.happened).toMatch(/never showed the older card/);

  const errorPending = bridge("error", "naive", ["pending", "resolved"], "rea");
  expect(errorPending?.happened).toMatch(/not returned yet is pending/);
  expect(errorPending?.happened).not.toMatch(/Search failed/);

  const errorNaive = bridge("error", "naive", ["rejected", "resolved"], "");
  expect(errorNaive?.happened).toMatch(/Search failed/);
  expect(errorNaive?.happened).toMatch(/Couldn't obtain West's signal/);
  expect(errorNaive?.happened).toMatch(/erased the rea result/);

  const errorGuarded = bridge("error", "protected", ["ignored", "resolved"], "rea");
  expect(errorGuarded?.happened).toMatch(/did not put the light out/);
  expect(errorGuarded?.happened).toMatch(/react/);

  const duplicate = bridge("duplicate", "naive", ["resolved", "resolved"], "re");
  expect(duplicate?.happened).toMatch(/heading stays Results for "re"/);
  expect(duplicate?.happened).toMatch(/resolved last and wrote again/);

  const duplicateGuarded = bridge("duplicate", "protected", ["ignored", "resolved"], "re");
  expect(duplicateGuarded?.happened).toMatch(/Request #1 was ignored/);
  expect(duplicateGuarded?.happened).toMatch(/channel name never change/);
});
