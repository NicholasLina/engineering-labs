import { afterEach, expect, test, vi } from "vitest";
import { failDelayMs, fastDelayMs, initialTasks } from "./board.ts";
import { createBoardServer } from "./server.ts";

afterEach(() => {
  vi.useRealTimers();
});

test("a save confirms only after its scheduled delay and bumps the revision", async () => {
  vi.useFakeTimers();
  const server = createBoardServer();
  let settled = false;
  const pending = server
    .save({
      taskId: "brief",
      baseRevision: 1,
      toColumn: "doing",
      delayMs: fastDelayMs,
      fail: false,
    })
    .then((result) => {
      settled = true;
      return result;
    });

  await vi.advanceTimersByTimeAsync(fastDelayMs - 1);
  expect(settled).toBe(false);
  expect(server.snapshot().find((task) => task.id === "brief")).toMatchObject({
    column: "todo",
    revision: 1,
  });

  await vi.advanceTimersByTimeAsync(1);
  await expect(pending).resolves.toMatchObject({
    type: "confirmed",
    task: { id: "brief", column: "doing", revision: 2 },
  });
  expect(server.snapshot().find((task) => task.id === "brief")).toMatchObject({
    column: "doing",
    revision: 2,
  });
});

test("a rejection leaves the server task unchanged", async () => {
  vi.useFakeTimers();
  const server = createBoardServer();
  const pending = server.save({
    taskId: "brief",
    baseRevision: 1,
    toColumn: "doing",
    delayMs: failDelayMs,
    fail: true,
  });

  await vi.advanceTimersByTimeAsync(failDelayMs);
  await expect(pending).resolves.toMatchObject({
    type: "rejected",
    task: { id: "brief", column: "todo", revision: 1 },
  });
  expect(server.snapshot()).toEqual(initialTasks());
});

test("a save conflicts when the server revision has already moved", async () => {
  vi.useFakeTimers();
  const server = createBoardServer();
  const replaced = server.replace("mock", "todo");
  expect(replaced).toMatchObject({ id: "mock", column: "todo", revision: 2 });

  const pending = server.save({
    taskId: "mock",
    baseRevision: 1,
    toColumn: "done",
    delayMs: 800,
    fail: false,
  });

  await vi.advanceTimersByTimeAsync(800);
  await expect(pending).resolves.toEqual({
    type: "conflict",
    task: { id: "mock", title: "Review the mock", column: "todo", revision: 2 },
  });
  expect(server.snapshot().find((task) => task.id === "mock")).toEqual(replaced);
});

test("a save captured before reset is ignored and does not write", async () => {
  vi.useFakeTimers();
  const server = createBoardServer();
  const pending = server.save({
    taskId: "brief",
    baseRevision: 1,
    toColumn: "done",
    delayMs: fastDelayMs,
    fail: false,
  });
  server.reset();

  await vi.advanceTimersByTimeAsync(fastDelayMs);
  await expect(pending).resolves.toEqual({ type: "ignored" });
  expect(server.generation()).toBe(1);
  expect(server.snapshot()).toEqual(initialTasks());
});

test("two tasks can confirm without sharing a revision", async () => {
  vi.useFakeTimers();
  const server = createBoardServer();
  const brief = server.save({
    taskId: "brief",
    baseRevision: 1,
    toColumn: "doing",
    delayMs: 400,
    fail: false,
  });
  const samples = server.save({
    taskId: "samples",
    baseRevision: 1,
    toColumn: "done",
    delayMs: 400,
    fail: false,
  });

  await vi.advanceTimersByTimeAsync(400);
  await expect(brief).resolves.toMatchObject({ type: "confirmed", task: { revision: 2 } });
  await expect(samples).resolves.toMatchObject({
    type: "confirmed",
    task: { column: "done", revision: 2 },
  });
});
