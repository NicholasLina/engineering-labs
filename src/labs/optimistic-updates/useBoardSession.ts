import { useEffect, useRef, useState } from "react";
import {
  projectBoard,
  type Attempt,
  type ColumnId,
  type Strategy,
  type Task,
  type VisibleTask,
} from "./board.ts";
import type { BoardServer, SaveResult } from "./server.ts";
import type { SaveOutcome, SaveSpan } from "./timeline.ts";

const logLimit = 50;

export type MoveOptions = {
  delayMs: number;
  fail: boolean;
};

export type SaveEventName =
  | "started"
  | "confirmed"
  | "rejected"
  | "rolled-back"
  | "conflict"
  | "retried"
  | "kept-mine"
  | "used-server"
  | "ignored";

export type SaveLogEntry = {
  id: number;
  taskId: string;
  title: string;
  column: ColumnId;
  event: SaveEventName;
};

export type Intent = {
  taskId: string;
  column: ColumnId;
  delayMs: number;
  fail: boolean;
};

type ViewState = {
  confirmed: Task[];
  attempts: Attempt[];
  desired: Intent[];
  serverTasks: Task[];
  log: SaveLogEntry[];
  requests: SaveSpan[];
};

export type BoardSession = ViewState & {
  visible: VisibleTask[];
  move: (taskId: string, column: ColumnId, options: MoveOptions) => void;
  retry: (taskId: string, options: MoveOptions) => void;
  keepMine: (taskId: string, options: MoveOptions) => void;
  useServer: (taskId: string) => void;
  replaceOnServer: (taskId: string, column: ColumnId) => void;
  clear: () => void;
};

type Runtime = {
  server: BoardServer;
  epoch: number;
  nextId: number;
  mounted: boolean;
  confirmed: Task[];
  serverTasks: Task[];
  desired: Map<string, Intent>;
  attempts: Map<string, Attempt>;
  log: SaveLogEntry[];
  requests: SaveSpan[];
};

function cloneTasks(tasks: readonly Task[]): Task[] {
  return tasks.map((task) => ({ ...task }));
}

function overlay(tasks: readonly Task[], task: Task): Task[] {
  return tasks.map((entry) => (entry.id === task.id ? { ...task } : { ...entry }));
}

function createRuntime(server: BoardServer): Runtime {
  const confirmed = server.snapshot();
  return {
    server,
    epoch: 0,
    nextId: 0,
    mounted: true,
    confirmed,
    serverTasks: cloneTasks(confirmed),
    desired: new Map(),
    attempts: new Map(),
    log: [],
    requests: [],
  };
}

function issuedAt(): number {
  return performance.now();
}

export function useBoardSession({
  server,
  strategy,
}: {
  server: BoardServer;
  strategy: Strategy;
}): BoardSession {
  const runtimeRef = useRef<Runtime | null>(null);
  const serverRef = useRef(server);

  const [view, setView] = useState<ViewState>(() => {
    const confirmed = server.snapshot();
    return {
      confirmed,
      attempts: [],
      desired: [],
      serverTasks: cloneTasks(confirmed),
      log: [],
      requests: [],
    };
  });

  function session(): Runtime {
    if (runtimeRef.current === null) {
      runtimeRef.current = createRuntime(serverRef.current);
    }
    runtimeRef.current.server = serverRef.current;
    return runtimeRef.current;
  }

  useEffect(() => {
    serverRef.current = server;
    const runtime = runtimeRef.current ?? createRuntime(server);
    runtimeRef.current = runtime;
    runtime.server = server;
    runtime.mounted = true;
    return () => {
      runtime.mounted = false;
      runtime.epoch += 1;
      runtime.server.reset();
    };
  }, [server]);

  function publish() {
    const runtime = session();
    setView({
      confirmed: cloneTasks(runtime.confirmed),
      attempts: [...runtime.attempts.values()].map((attempt) => ({
        ...attempt,
        serverTask: attempt.serverTask ? { ...attempt.serverTask } : undefined,
      })),
      desired: [...runtime.desired.values()].map((intent) => ({ ...intent })),
      serverTasks: cloneTasks(runtime.serverTasks),
      log: runtime.log,
      requests: runtime.requests,
    });
  }

  function titleOf(taskId: string): string {
    const runtime = session();
    const task =
      runtime.confirmed.find((entry) => entry.id === taskId) ??
      runtime.serverTasks.find((entry) => entry.id === taskId);
    return task ? task.title : taskId;
  }

  function append(entries: SaveLogEntry[]) {
    const runtime = session();
    runtime.log = [...runtime.log, ...entries].slice(-logLimit);
  }

  function addSpan(span: SaveSpan) {
    const runtime = session();
    runtime.requests = [...runtime.requests, span].slice(-logLimit);
  }

  function setOutcome(id: number, outcome: SaveOutcome) {
    const runtime = session();
    runtime.requests = runtime.requests.map((span) =>
      span.id === id ? { ...span, outcome } : span,
    );
  }

  function canApply(epoch: number, taskId: string, operationId: number): boolean {
    const runtime = session();
    if (!runtime.mounted || runtime.epoch !== epoch) {
      return false;
    }
    return runtime.attempts.get(taskId)?.operationId === operationId;
  }

  function beginSave(
    taskId: string,
    column: ColumnId,
    options: MoveOptions,
    baseRevision: number,
    event: "started" | "retried" | "kept-mine",
  ) {
    const runtime = session();
    const operationId = ++runtime.nextId;
    const epoch = runtime.epoch;
    const title = titleOf(taskId);
    runtime.desired.set(taskId, { taskId, column, delayMs: options.delayMs, fail: options.fail });
    runtime.attempts.set(taskId, {
      operationId,
      taskId,
      toColumn: column,
      baseRevision,
      delayMs: options.delayMs,
      phase: "inflight",
    });
    append([{ id: operationId, taskId, title, column, event }]);
    addSpan({
      id: operationId,
      taskId,
      title,
      startedAtMs: issuedAt(),
      delayMs: options.delayMs,
      outcome: "pending",
    });

    void runtime.server
      .save({
        taskId,
        baseRevision,
        toColumn: column,
        delayMs: options.delayMs,
        fail: options.fail,
      })
      .then((result) => {
        settle(epoch, operationId, taskId, result);
      });
  }

  function settle(epoch: number, operationId: number, taskId: string, result: SaveResult) {
    if (!canApply(epoch, taskId, operationId)) {
      return;
    }

    const runtime = session();
    const attempt = runtime.attempts.get(taskId);
    if (!attempt) {
      return;
    }
    const title = titleOf(taskId);

    if (result.type === "ignored") {
      setOutcome(operationId, "ignored");
      append([{ id: operationId, taskId, title, column: attempt.toColumn, event: "ignored" }]);
      runtime.attempts.delete(taskId);
      runtime.desired.delete(taskId);
      publish();
      return;
    }

    if (result.type === "rejected") {
      attempt.phase = "rejected";
      runtime.serverTasks = overlay(runtime.server.snapshot(), result.task);
      setOutcome(operationId, "rejected");
      const confirmed = runtime.confirmed.find((entry) => entry.id === taskId);
      append([
        { id: operationId, taskId, title, column: attempt.toColumn, event: "rejected" },
        {
          id: operationId,
          taskId,
          title,
          column: confirmed ? confirmed.column : attempt.toColumn,
          event: "rolled-back",
        },
      ]);
      publish();
      return;
    }

    if (result.type === "conflict") {
      attempt.phase = "conflict";
      attempt.serverTask = { ...result.task };
      runtime.serverTasks = overlay(runtime.server.snapshot(), result.task);
      setOutcome(operationId, "conflict");
      append([{ id: operationId, taskId, title, column: attempt.toColumn, event: "conflict" }]);
      publish();
      return;
    }

    runtime.confirmed = runtime.confirmed.map((entry) =>
      entry.id === result.task.id ? { ...result.task } : entry,
    );
    runtime.serverTasks = overlay(runtime.server.snapshot(), result.task);
    setOutcome(operationId, "confirmed");
    append([{ id: operationId, taskId, title, column: result.task.column, event: "confirmed" }]);
    runtime.attempts.delete(taskId);
    const intent = runtime.desired.get(taskId);
    // A newer column chosen while this save was in flight is sent once, from the revision just stored.
    if (intent && intent.column !== result.task.column) {
      beginSave(
        taskId,
        intent.column,
        { delayMs: intent.delayMs, fail: intent.fail },
        result.task.revision,
        "started",
      );
    } else {
      runtime.desired.delete(taskId);
    }
    publish();
  }

  function move(taskId: string, column: ColumnId, options: MoveOptions) {
    const runtime = session();
    const confirmed = runtime.confirmed.find((entry) => entry.id === taskId);
    if (!confirmed) {
      return;
    }

    const attempt = runtime.attempts.get(taskId);
    if (attempt?.phase === "inflight") {
      runtime.desired.set(taskId, { taskId, column, delayMs: options.delayMs, fail: options.fail });
      publish();
      return;
    }

    if (attempt?.phase === "rejected" && column === confirmed.column) {
      runtime.attempts.delete(taskId);
      runtime.desired.delete(taskId);
      publish();
      return;
    }

    if (attempt?.phase === "rejected" || attempt?.phase === "conflict") {
      runtime.desired.set(taskId, { taskId, column, delayMs: options.delayMs, fail: options.fail });
      publish();
      return;
    }

    if (column === confirmed.column) {
      return;
    }

    beginSave(taskId, column, options, confirmed.revision, "started");
    publish();
  }

  function retry(taskId: string, options: MoveOptions) {
    const runtime = session();
    const attempt = runtime.attempts.get(taskId);
    const confirmed = runtime.confirmed.find((entry) => entry.id === taskId);
    if (!attempt || attempt.phase !== "rejected" || !confirmed) {
      return;
    }

    const column = runtime.desired.get(taskId)?.column ?? attempt.toColumn;
    if (column === confirmed.column) {
      runtime.attempts.delete(taskId);
      runtime.desired.delete(taskId);
      publish();
      return;
    }

    beginSave(taskId, column, options, confirmed.revision, "retried");
    publish();
  }

  function keepMine(taskId: string, options: MoveOptions) {
    const runtime = session();
    const attempt = runtime.attempts.get(taskId);
    if (!attempt || attempt.phase !== "conflict" || !attempt.serverTask) {
      return;
    }

    const column = runtime.desired.get(taskId)?.column ?? attempt.toColumn;
    beginSave(taskId, column, options, attempt.serverTask.revision, "kept-mine");
    publish();
  }

  function useServer(taskId: string) {
    const runtime = session();
    const attempt = runtime.attempts.get(taskId);
    if (!attempt || attempt.phase !== "conflict" || !attempt.serverTask) {
      return;
    }

    const serverTask = attempt.serverTask;
    runtime.confirmed = runtime.confirmed.map((entry) =>
      entry.id === taskId ? { ...serverTask } : entry,
    );
    runtime.serverTasks = overlay(runtime.serverTasks, serverTask);
    runtime.attempts.delete(taskId);
    runtime.desired.delete(taskId);
    append([
      {
        id: attempt.operationId,
        taskId,
        title: serverTask.title,
        column: serverTask.column,
        event: "used-server",
      },
    ]);
    publish();
  }

  function replaceOnServer(taskId: string, column: ColumnId) {
    const runtime = session();
    runtime.server.replace(taskId, column);
    runtime.serverTasks = runtime.server.snapshot();
    publish();
  }

  function clear() {
    const runtime = session();
    runtime.epoch += 1;
    runtime.server.reset();
    runtime.confirmed = runtime.server.snapshot();
    runtime.serverTasks = cloneTasks(runtime.confirmed);
    runtime.attempts.clear();
    runtime.desired.clear();
    runtime.log = [];
    runtime.requests = [];
    publish();
  }

  return {
    ...view,
    visible: projectBoard(view.confirmed, view.attempts, view.desired, strategy),
    move,
    retry,
    keepMine,
    useServer,
    replaceOnServer,
    clear,
  };
}
