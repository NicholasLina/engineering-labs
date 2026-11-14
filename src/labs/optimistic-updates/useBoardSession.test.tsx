import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { initialTasks, type ColumnId, type Strategy, type Task } from "./board.ts";
import { createBoardServer, type BoardServer, type SaveRequest, type SaveResult } from "./server.ts";
import { useBoardSession, type MoveOptions } from "./useBoardSession.ts";

const fast: MoveOptions = { delayMs: 400, fail: false };

type PendingSave = {
  request: SaveRequest;
  finish: (result: SaveResult) => void;
};

function createControllableServer(seed: readonly Task[] = initialTasks()) {
  let generation = 0;
  let tasks = seed.map((task) => ({ ...task }));
  const calls: PendingSave[] = [];
  const server: BoardServer = {
    snapshot() {
      return tasks.map((task) => ({ ...task }));
    },
    generation() {
      return generation;
    },
    replace(taskId, column) {
      const task = tasks.find((entry) => entry.id === taskId);
      if (!task) {
        throw new Error(taskId);
      }
      task.column = column;
      task.revision += 1;
      return { ...task };
    },
    reset() {
      generation += 1;
      tasks = seed.map((task) => ({ ...task }));
    },
    save(request) {
      const captured = generation;
      return new Promise((resolve) => {
        calls.push({
          request,
          finish(result) {
            if (captured !== generation) {
              resolve({ type: "ignored" });
              return;
            }
            resolve(result);
          },
        });
      });
    },
  };

  return { server, calls };
}

function renderSession(server: BoardServer, strategy: Strategy = "optimistic") {
  return renderHook(
    ({ current }: { current: Strategy }) => useBoardSession({ server, strategy: current }),
    { initialProps: { current: strategy } },
  );
}

function confirmed(id: string, column: ColumnId, revision: number): SaveResult {
  const title = initialTasks().find((task) => task.id === id)?.title ?? id;
  return { type: "confirmed", task: { id, title, column, revision } };
}

function byId<T extends { id: string }>(items: readonly T[], id: string): T {
  const found = items.find((entry) => entry.id === id);
  if (!found) {
    throw new Error(id);
  }
  return found;
}

function byTask<T extends { taskId: string }>(items: readonly T[], taskId: string): T {
  const found = items.find((entry) => entry.taskId === taskId);
  if (!found) {
    throw new Error(taskId);
  }
  return found;
}

afterEach(() => {
  vi.useRealTimers();
});

test("a rejected save leaves another task's pending edit in place", async () => {
  const { server, calls } = createControllableServer();
  const { result } = renderSession(server);

  act(() => {
    result.current.move("brief", "doing", fast);
    result.current.move("samples", "done", fast);
  });

  await act(async () => {
    calls[0]?.finish({
      type: "rejected",
      task: { id: "brief", title: "Draft the brief", column: "todo", revision: 1 },
    });
  });

  expect(byTask(result.current.attempts, "brief").phase).toBe("rejected");
  expect(byTask(result.current.attempts, "samples").phase).toBe("inflight");
  expect(byId(result.current.visible, "brief")).toMatchObject({ column: "todo", mark: "rolled-back" });
  expect(byId(result.current.visible, "samples")).toMatchObject({ column: "done", mark: "pending" });
  expect(byId(result.current.confirmed, "samples")).toMatchObject({ column: "todo", revision: 1 });

  await act(async () => {
    calls[1]?.finish(confirmed("samples", "done", 2));
  });

  expect(byId(result.current.confirmed, "samples")).toMatchObject({ column: "done", revision: 2 });
  expect(byId(result.current.confirmed, "brief")).toMatchObject({ column: "todo", revision: 1 });
  expect(byId(result.current.visible, "brief").mark).toBe("rolled-back");
});

test("a newer desired column survives the older rejection and retry sends that column", async () => {
  const { server, calls } = createControllableServer();
  const { result } = renderSession(server);

  act(() => {
    result.current.move("brief", "doing", fast);
    result.current.move("brief", "done", { delayMs: 1600, fail: false });
  });
  expect(calls).toHaveLength(1);
  expect(calls[0]?.request).toMatchObject({ toColumn: "doing", baseRevision: 1 });

  await act(async () => {
    calls[0]?.finish({
      type: "rejected",
      task: { id: "brief", title: "Draft the brief", column: "todo", revision: 1 },
    });
  });

  expect(calls).toHaveLength(1);
  expect(byTask(result.current.desired, "brief").column).toBe("done");
  expect(byId(result.current.visible, "brief")).toMatchObject({ column: "done", mark: "rolled-back" });

  act(() => {
    result.current.retry("brief", { delayMs: 700, fail: false });
  });
  expect(calls[1]?.request).toMatchObject({
    toColumn: "done",
    baseRevision: 1,
    delayMs: 700,
    fail: false,
  });
  expect(result.current.log.at(-1)).toMatchObject({ id: 2, event: "retried", column: "done" });
});

test("a confirmed save sends one follow-up for a newer column", async () => {
  const { server, calls } = createControllableServer();
  const { result } = renderSession(server);

  act(() => {
    result.current.move("brief", "doing", { delayMs: 400, fail: false });
    result.current.move("brief", "done", { delayMs: 1600, fail: true });
  });

  await act(async () => {
    calls[0]?.finish(confirmed("brief", "doing", 2));
  });

  expect(calls[1]?.request).toMatchObject({
    toColumn: "done",
    baseRevision: 2,
    delayMs: 1600,
    fail: true,
  });
  expect(result.current.log.map((entry) => entry.event)).toEqual(["started", "confirmed", "started"]);
  expect(byId(result.current.visible, "brief")).toMatchObject({ column: "done", mark: "pending" });
  expect(byId(result.current.confirmed, "brief").revision).toBe(2);
});

test("keep mine writes the desired column onto the conflict response revision", async () => {
  const { server, calls } = createControllableServer();
  const { result } = renderSession(server);

  act(() => {
    result.current.replaceOnServer("mock", "todo");
    result.current.move("mock", "done", { delayMs: 800, fail: false });
  });

  expect(byId(result.current.serverTasks, "mock")).toMatchObject({ column: "todo", revision: 2 });
  expect(byId(result.current.confirmed, "mock")).toMatchObject({ column: "doing", revision: 1 });
  expect(calls[0]?.request.baseRevision).toBe(1);

  await act(async () => {
    calls[0]?.finish({
      type: "conflict",
      task: { id: "mock", title: "Review the mock", column: "todo", revision: 5 },
    });
  });

  act(() => {
    result.current.move("mock", "doing", { delayMs: 50, fail: false });
  });
  expect(calls).toHaveLength(1);
  expect(byId(result.current.visible, "mock")).toMatchObject({ column: "doing", mark: "conflict" });

  act(() => {
    result.current.keepMine("mock", { delayMs: 50, fail: false });
  });
  expect(calls[1]?.request).toMatchObject({
    baseRevision: 5,
    toColumn: "doing",
    delayMs: 50,
  });
  expect(result.current.log.at(-1)?.event).toBe("kept-mine");

  await act(async () => {
    calls[1]?.finish(confirmed("mock", "doing", 6));
  });
  expect(byId(result.current.confirmed, "mock")).toMatchObject({ column: "doing", revision: 6 });
  expect(result.current.attempts.find((attempt) => attempt.taskId === "mock")).toBeUndefined();
});

test("use server copies the conflict response and discards the local column", async () => {
  const { server, calls } = createControllableServer();
  const { result } = renderSession(server);

  act(() => {
    result.current.move("mock", "done", fast);
  });
  await act(async () => {
    calls[0]?.finish({
      type: "conflict",
      task: { id: "mock", title: "Review the mock", column: "todo", revision: 5 },
    });
  });

  act(() => {
    result.current.useServer("mock");
  });

  expect(calls).toHaveLength(1);
  expect(byId(result.current.confirmed, "mock")).toMatchObject({ column: "todo", revision: 5 });
  expect(byId(result.current.visible, "mock")).toMatchObject({ column: "todo", mark: "confirmed" });
  expect(result.current.desired.find((intent) => intent.taskId === "mock")).toBeUndefined();
  expect(result.current.log.at(-1)).toMatchObject({ id: 1, event: "used-server", column: "todo" });
});

test("wait mode keeps the confirmed column until the save confirms", async () => {
  const { server, calls } = createControllableServer();
  const { result, rerender } = renderSession(server, "wait");

  act(() => {
    result.current.move("brief", "doing", fast);
  });
  expect(byId(result.current.visible, "brief")).toMatchObject({ column: "todo", mark: "pending" });

  rerender({ current: "optimistic" });
  expect(calls).toHaveLength(1);
  expect(byId(result.current.visible, "brief")).toMatchObject({ column: "doing", mark: "pending" });

  await act(async () => {
    calls[0]?.finish(confirmed("brief", "doing", 2));
  });
  expect(byId(result.current.visible, "brief")).toMatchObject({
    column: "doing",
    mark: "confirmed",
    revision: 2,
  });
});

test("clear drops a late save, and a later move can confirm", async () => {
  vi.useFakeTimers();
  const server = createBoardServer();
  const { result } = renderSession(server);

  act(() => {
    result.current.move("brief", "done", { delayMs: 400, fail: false });
  });
  act(() => {
    result.current.clear();
  });

  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });

  expect(server.snapshot()).toEqual(initialTasks());
  expect(result.current.confirmed).toEqual(initialTasks());
  expect(result.current.log).toEqual([]);
  expect(result.current.requests).toEqual([]);

  act(() => {
    result.current.move("brief", "doing", { delayMs: 400, fail: false });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });

  expect(byId(result.current.confirmed, "brief")).toMatchObject({ column: "doing", revision: 2 });
  expect(byId(server.snapshot(), "brief")).toMatchObject({ column: "doing", revision: 2 });
});

test("unmount resets the server so a late save cannot write", async () => {
  vi.useFakeTimers();
  const server = createBoardServer();
  const { result, unmount } = renderSession(server);

  act(() => {
    result.current.move("brief", "done", { delayMs: 400, fail: false });
  });
  unmount();

  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });

  expect(server.snapshot()).toEqual(initialTasks());
  expect(server.generation()).toBe(1);
});

test("the log and timeline keep the latest 50 entries", () => {
  const tasks = Array.from({ length: 60 }, (_, index) => ({
    id: `t${index}`,
    title: `Task ${index}`,
    column: "todo" as const,
    revision: 1,
  }));
  const { server } = createControllableServer(tasks);
  const { result } = renderSession(server);

  act(() => {
    for (const task of tasks) {
      result.current.move(task.id, "doing", fast);
    }
  });

  expect(result.current.log).toHaveLength(50);
  expect(result.current.log[0]?.id).toBe(11);
  expect(result.current.log.at(-1)?.id).toBe(60);
  expect(result.current.requests).toHaveLength(50);
  expect(result.current.requests[0]?.id).toBe(11);
  expect(result.current.requests.at(-1)?.outcome).toBe("pending");
  expect(result.current.requests.at(-1)?.delayMs).toBe(400);
});
