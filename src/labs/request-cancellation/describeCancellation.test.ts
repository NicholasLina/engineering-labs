import { expect, test } from "vitest";
import { describeCancellation } from "./describeCancellation.ts";
import type { LogEntry, RequestRecord } from "./useCancellationSession.ts";

function request(patch: Partial<RequestRecord> & Pick<RequestRecord, "id" | "query">): RequestRecord {
  return {
    plannedMs: 600,
    startedAt: 0,
    endedAt: null,
    outcome: "pending",
    write: "pending",
    ...patch,
  };
}

function entry(patch: Pick<LogEntry, "id" | "query" | "event"> & { at?: number }): LogEntry {
  return { at: 0, ...patch };
}

test("idle copy says nothing has been requested", () => {
  const copy = describeCancellation({
    mode: "ignore",
    status: "idle",
    query: "",
    resultsQuery: "",
    requests: [],
    log: [],
  });

  expect(copy.happened).toBe("Nothing has been requested yet.");
  expect(copy.search).toMatch(/idle/i);
  expect(copy.lifetime).toMatch(/no request/i);
  expect(copy.log).toMatch(/empty/i);
});

test("an aborted request reports a shorter lifetime than it planned", () => {
  const copy = describeCancellation({
    mode: "abort",
    status: "idle",
    query: "re",
    resultsQuery: "",
    requests: [
      request({
        id: 1,
        query: "re",
        plannedMs: 600,
        startedAt: 1000,
        endedAt: 1000,
        outcome: "aborted",
        write: "ignored",
      }),
    ],
    log: [
      entry({ id: 1, query: "re", event: "started" }),
      entry({ id: 1, query: "re", event: "abort-requested" }),
      entry({ id: 1, query: "re", event: "aborted" }),
    ],
  });

  expect(copy.happened).toMatch(/aborted/i);
  expect(copy.lifetime).toBe(
    'Request #1 for "re" was planned for 600 ms and ran for 0 ms.',
  );
  expect(copy.log).toMatch(/abort-requested/);
  expect(copy.log).toMatch(/aborted/);
});

test("an ignored completion records both the finished work and the refused write", () => {
  const copy = describeCancellation({
    mode: "ignore",
    status: "success",
    query: "rea",
    resultsQuery: "rea",
    requests: [
      request({
        id: 1,
        query: "re",
        plannedMs: 600,
        startedAt: 0,
        endedAt: 600,
        outcome: "completed",
        write: "ignored",
      }),
      request({
        id: 2,
        query: "rea",
        plannedMs: 80,
        startedAt: 0,
        endedAt: 80,
        outcome: "completed",
        write: "applied",
      }),
    ],
    log: [
      entry({ id: 1, query: "re", event: "started" }),
      entry({ id: 2, query: "rea", event: "started" }),
      entry({ id: 2, query: "rea", event: "completed", at: 80 }),
      entry({ id: 1, query: "re", event: "completed", at: 600 }),
      entry({ id: 1, query: "re", event: "ignored", at: 600 }),
    ],
  });

  expect(copy.happened).toMatch(/completed/i);
  expect(copy.happened).toMatch(/ignored/i);
  expect(copy.happened).toMatch(/rea/);
  expect(copy.lifetime).toContain(
    'Request #1 for "re" was planned for 600 ms and ran for 600 ms.',
  );
  expect(copy.log).toContain("completed");
  expect(copy.log).toContain("ignored");
});
