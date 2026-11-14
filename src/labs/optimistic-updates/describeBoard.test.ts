import { expect, test } from "vitest";
import { initialTasks, type Attempt, type Task } from "./board.ts";
import { describeBoard, eventLabel, type BoardSnapshot } from "./describeBoard.ts";
import { projectBoard } from "./board.ts";
import type { SaveSpan } from "./timeline.ts";
import type { Intent, SaveLogEntry } from "./useBoardSession.ts";

function task(id: string, column: Task["column"], revision: number): Task {
  const seed = initialTasks().find((entry) => entry.id === id);
  if (!seed) {
    throw new Error(id);
  }
  return { ...seed, column, revision };
}

function span(id: number, taskId: string, delayMs: number, outcome: SaveSpan["outcome"]): SaveSpan {
  const title = initialTasks().find((entry) => entry.id === taskId)?.title ?? taskId;
  return { id, taskId, title, startedAtMs: 0, delayMs, outcome };
}

function entry(
  id: number,
  taskId: string,
  column: Task["column"],
  event: SaveLogEntry["event"],
): SaveLogEntry {
  const title = initialTasks().find((item) => item.id === taskId)?.title ?? taskId;
  return { id, taskId, title, column, event };
}

function snapshot(overrides: Partial<BoardSnapshot> & Pick<BoardSnapshot, "kind" | "strategy">): BoardSnapshot {
  const confirmed = overrides.confirmed ?? initialTasks();
  const attempts = overrides.attempts ?? [];
  const desired = overrides.desired ?? [];
  return {
    visible: overrides.visible ?? projectBoard(confirmed, attempts, desired, overrides.strategy),
    confirmed,
    serverTasks: overrides.serverTasks ?? confirmed.map((item) => ({ ...item })),
    attempts,
    desired,
    log: overrides.log ?? [],
    requests: overrides.requests ?? [],
    kind: overrides.kind,
    strategy: overrides.strategy,
  };
}

const briefDoing: Attempt = {
  operationId: 1,
  taskId: "brief",
  toColumn: "doing",
  baseRevision: 1,
  delayMs: 400,
  phase: "inflight",
};

test("event labels are the words shown in the list", () => {
  expect(eventLabel("started")).toBe("Pending");
  expect(eventLabel("retried")).toBe("Retry");
  expect(eventLabel("kept-mine")).toBe("Keep mine");
  expect(eventLabel("used-server")).toBe("Use server");
  expect(eventLabel("confirmed")).toBe("Confirmed");
  expect(eventLabel("rejected")).toBe("Rejected");
  expect(eventLabel("rolled-back")).toBe("Rolled back");
  expect(eventLabel("conflict")).toBe("Conflict");
  expect(eventLabel("ignored")).toBe("Ignored");
});

test("an untouched board explains that nothing has been saved", () => {
  expect(describeBoard(snapshot({ kind: "idle", strategy: "optimistic" }))).toMatchObject({
    happened: "Nothing has been saved yet. Run a scenario, or move a card.",
    board: "The columns show the confirmed cards. No save is pending.",
  });
});

test("clear explains that a late save cannot write", () => {
  expect(describeBoard(snapshot({ kind: "cleared", strategy: "optimistic" })).happened).toBe(
    "Clear restored the initial board and server. A save that was already running cannot write.",
  );
});

test("a pending optimistic save names the scheduled delay and the unchanged server", () => {
  const copy = describeBoard(
    snapshot({
      kind: "success",
      strategy: "optimistic",
      attempts: [briefDoing],
      desired: [{ taskId: "brief", column: "doing", delayMs: 400, fail: false }],
      log: [entry(1, "brief", "doing", "started")],
      requests: [span(1, "brief", 400, "pending")],
    }),
  );

  expect(copy.happened).toBe(
    "Draft the brief moved to In progress immediately. The save is still pending. It is scheduled to wait 400 ms, and the server has not accepted it.",
  );
  expect(copy.board).toContain("marked Pending");
  expect(copy.server).toBe("The server lists Draft the brief in To do at revision 1.");
  expect(copy.recovery).toBe("If this save is rejected, only this card rolls back.");
});

test("wait mode keeps the pending card in the confirmed column", () => {
  const copy = describeBoard(
    snapshot({
      kind: "slow",
      strategy: "wait",
      attempts: [{ ...briefDoing, delayMs: 1600 }],
      desired: [{ taskId: "brief", column: "doing", delayMs: 1600, fail: false }],
      log: [entry(1, "brief", "doing", "started")],
      requests: [span(1, "brief", 1600, "pending")],
    }),
  );

  expect(copy.happened).toContain("stays in To do");
  expect(copy.happened).toContain("scheduled to wait 1600 ms");
  expect(copy.board).toBe("Draft the brief is marked Pending in its confirmed column, To do.");
});

test("a confirmed save reports the new revision", () => {
  const confirmed = initialTasks().map((item) =>
    item.id === "brief" ? task("brief", "doing", 2) : item,
  );
  const copy = describeBoard(
    snapshot({
      kind: "success",
      strategy: "optimistic",
      confirmed,
      serverTasks: confirmed,
      log: [entry(1, "brief", "doing", "started"), entry(1, "brief", "doing", "confirmed")],
      requests: [span(1, "brief", 400, "confirmed")],
    }),
  );

  expect(copy.happened).toBe(
    "The server accepted Draft the brief in In progress. The revision is now 2. The card is confirmed.",
  );
  expect(copy.server).toBe("The server lists Draft the brief in In progress at revision 2.");
  expect(copy.recovery).toBe("This save is done. There is nothing to retry.");
});

test("a rollback names the rejected move and the retry", () => {
  const copy = describeBoard(
    snapshot({
      kind: "failed",
      strategy: "optimistic",
      attempts: [{ ...briefDoing, delayMs: 700, phase: "rejected" }],
      desired: [{ taskId: "brief", column: "doing", delayMs: 700, fail: true }],
      log: [entry(1, "brief", "doing", "started"), entry(1, "brief", "doing", "rolled-back")],
      requests: [span(1, "brief", 700, "rejected")],
    }),
  );

  expect(copy.happened).toContain("rejected the move of Draft the brief to In progress");
  expect(copy.happened).toContain("scheduled to wait 700 ms");
  expect(copy.happened).toContain("returned to To do");
  expect(copy.board).toContain("marked Rolled back");
  expect(copy.server).toBe("The server lists Draft the brief in To do at revision 1.");
  expect(copy.recovery).toBe("Retry sends Draft the brief to In progress again, from revision 1.");
});

test("a conflict explains both recovery choices from the server revision", () => {
  const serverTask = task("mock", "todo", 2);
  const attempt: Attempt = {
    operationId: 1,
    taskId: "mock",
    toColumn: "done",
    baseRevision: 1,
    delayMs: 800,
    phase: "conflict",
    serverTask,
  };
  const desired: Intent = { taskId: "mock", column: "done", delayMs: 800, fail: false };
  const copy = describeBoard(
    snapshot({
      kind: "conflict",
      strategy: "optimistic",
      attempts: [attempt],
      desired: [desired],
      serverTasks: initialTasks().map((item) => (item.id === "mock" ? serverTask : item)),
      log: [entry(1, "mock", "done", "conflict")],
      requests: [span(1, "mock", 800, "conflict")],
    }),
  );

  expect(copy.happened).toContain("The save of Review the mock to Done conflicted");
  expect(copy.happened).toContain("To do at revision 2");
  expect(copy.happened).toContain("stays in Done");
  expect(copy.recovery).toBe(
    "Keep mine writes Done onto revision 2. Use server moves the card to To do and drops the local choice.",
  );
});

test("another pending card is named beside the latest save", () => {
  const copy = describeBoard(
    snapshot({
      kind: "manual",
      strategy: "optimistic",
      attempts: [
        briefDoing,
        {
          operationId: 2,
          taskId: "samples",
          toColumn: "done",
          baseRevision: 1,
          delayMs: 400,
          phase: "inflight",
        },
      ],
      desired: [
        { taskId: "brief", column: "doing", delayMs: 400, fail: false },
        { taskId: "samples", column: "done", delayMs: 400, fail: false },
      ],
      log: [entry(1, "brief", "doing", "started"), entry(2, "samples", "done", "started")],
      requests: [span(1, "brief", 400, "pending"), span(2, "samples", 400, "pending")],
    }),
  );

  expect(copy.happened).toContain("moved to Done immediately");
  expect(copy.recovery).toContain("Draft the brief is still pending");
});
