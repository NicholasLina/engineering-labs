import { expect, test } from "vitest";
import {
  initialTasks,
  projectBoard,
  type Attempt,
  type Task,
} from "./board.ts";

function attempt(overrides: Partial<Attempt> & Pick<Attempt, "taskId" | "toColumn">): Attempt {
  return {
    operationId: 1,
    baseRevision: 1,
    delayMs: 400,
    phase: "inflight",
    ...overrides,
  };
}

function task(tasks: readonly Task[], id: string): Task {
  const found = tasks.find((entry) => entry.id === id);
  if (!found) {
    throw new Error(`Missing ${id}`);
  }
  return found;
}

test("wait mode keeps the confirmed column while a save is in flight", () => {
  const visible = projectBoard(
    initialTasks(),
    [attempt({ taskId: "brief", toColumn: "doing" })],
    [{ taskId: "brief", column: "doing" }],
    "wait",
  );

  expect(task(visible, "brief")).toMatchObject({
    column: "todo",
    confirmedColumn: "todo",
    mark: "pending",
    revision: 1,
  });
  expect(task(visible, "samples")).toMatchObject({ column: "todo", mark: "confirmed" });
});

test("optimistic mode shows the desired column before the server confirms", () => {
  const visible = projectBoard(
    initialTasks(),
    [attempt({ taskId: "brief", toColumn: "doing" })],
    [{ taskId: "brief", column: "doing" }],
    "optimistic",
  );

  expect(task(visible, "brief")).toMatchObject({
    column: "doing",
    confirmedColumn: "todo",
    mark: "pending",
  });
});

test("a rejected optimistic move returns only that card", () => {
  const confirmed = initialTasks().map((entry) =>
    entry.id === "samples" ? { ...entry, column: "doing" as const, revision: 2 } : entry,
  );
  const visible = projectBoard(
    confirmed,
    [attempt({ taskId: "brief", toColumn: "doing", phase: "rejected" })],
    [{ taskId: "brief", column: "doing" }],
    "optimistic",
  );

  expect(task(visible, "brief")).toMatchObject({
    column: "todo",
    confirmedColumn: "todo",
    mark: "rolled-back",
  });
  expect(task(visible, "samples")).toMatchObject({
    column: "doing",
    revision: 2,
    mark: "confirmed",
  });
});

test("a newer desired column stays visible after an older rejection", () => {
  const visible = projectBoard(
    initialTasks(),
    [attempt({ taskId: "brief", toColumn: "doing", phase: "rejected" })],
    [{ taskId: "brief", column: "done" }],
    "optimistic",
  );

  expect(task(visible, "brief")).toMatchObject({
    column: "done",
    confirmedColumn: "todo",
    mark: "rolled-back",
  });
});

test("wait mode keeps a rejected card in its confirmed column", () => {
  const visible = projectBoard(
    initialTasks(),
    [attempt({ taskId: "brief", toColumn: "doing", phase: "rejected" })],
    [{ taskId: "brief", column: "doing" }],
    "wait",
  );

  expect(task(visible, "brief")).toMatchObject({ column: "todo", mark: "rolled-back" });
});

test("a conflict keeps the desired column only in optimistic mode", () => {
  const serverTask = {
    id: "mock",
    title: "Review the mock",
    column: "todo" as const,
    revision: 2,
  };
  const attempts = [
    attempt({
      taskId: "mock",
      toColumn: "done",
      phase: "conflict",
      serverTask,
    }),
  ];
  const desired = [{ taskId: "mock", column: "done" as const }];

  expect(task(projectBoard(initialTasks(), attempts, desired, "optimistic"), "mock")).toMatchObject({
    column: "done",
    confirmedColumn: "doing",
    mark: "conflict",
  });
  expect(task(projectBoard(initialTasks(), attempts, desired, "wait"), "mock")).toMatchObject({
    column: "doing",
    mark: "conflict",
  });
});

test("a confirmed snapshot with no attempt shows the saved column", () => {
  const confirmed = initialTasks().map((entry) =>
    entry.id === "brief" ? { ...entry, column: "doing" as const, revision: 2 } : entry,
  );

  expect(task(projectBoard(confirmed, [], [], "optimistic"), "brief")).toMatchObject({
    column: "doing",
    confirmedColumn: "doing",
    revision: 2,
    mark: "confirmed",
  });
});
