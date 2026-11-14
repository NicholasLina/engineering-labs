export type ColumnId = "todo" | "doing" | "done";

export type Task = {
  id: string;
  title: string;
  column: ColumnId;
  revision: number;
};

export type Strategy = "wait" | "optimistic";

export type AttemptPhase = "inflight" | "rejected" | "conflict";

export type Attempt = {
  operationId: number;
  taskId: string;
  toColumn: ColumnId;
  baseRevision: number;
  delayMs: number;
  phase: AttemptPhase;
  serverTask?: Task;
};

export type DesiredMove = {
  taskId: string;
  column: ColumnId;
};

export type CardMark = "confirmed" | "pending" | "rolled-back" | "conflict";

export type VisibleTask = {
  id: string;
  title: string;
  column: ColumnId;
  confirmedColumn: ColumnId;
  revision: number;
  mark: CardMark;
};

export const columns: readonly { id: ColumnId; label: string }[] = [
  { id: "todo", label: "To do" },
  { id: "doing", label: "In progress" },
  { id: "done", label: "Done" },
];

export const fastDelayMs = 400;
export const slowDelayMs = 1600;
export const failDelayMs = 700;
export const conflictDelayMs = 800;

export function columnLabel(column: ColumnId): string {
  const match = columns.find((entry) => entry.id === column);
  return match ? match.label : column;
}

export function initialTasks(): Task[] {
  return [
    { id: "brief", title: "Draft the brief", column: "todo", revision: 1 },
    { id: "samples", title: "Label the samples", column: "todo", revision: 1 },
    { id: "mock", title: "Review the mock", column: "doing", revision: 1 },
    { id: "notes", title: "Ship the notes", column: "done", revision: 1 },
  ];
}

function lastAttempt(attempts: readonly Attempt[], taskId: string): Attempt | undefined {
  let found: Attempt | undefined;
  for (const attempt of attempts) {
    if (attempt.taskId === taskId) {
      found = attempt;
    }
  }
  return found;
}

function lastDesired(
  desired: readonly DesiredMove[],
  taskId: string,
  fallback: ColumnId,
): ColumnId {
  let column = fallback;
  for (const move of desired) {
    if (move.taskId === taskId) {
      column = move.column;
    }
  }
  return column;
}

function markFor(phase: AttemptPhase): CardMark {
  if (phase === "inflight") {
    return "pending";
  }
  if (phase === "rejected") {
    return "rolled-back";
  }
  return "conflict";
}

export function projectBoard(
  confirmed: readonly Task[],
  attempts: readonly Attempt[],
  desired: readonly DesiredMove[],
  strategy: Strategy,
): VisibleTask[] {
  return confirmed.map((task) => {
    const attempt = lastAttempt(attempts, task.id);
    const base = {
      id: task.id,
      title: task.title,
      confirmedColumn: task.column,
      revision: task.revision,
    };
    if (!attempt) {
      return { ...base, column: task.column, mark: "confirmed" as const };
    }

    const desiredColumn = lastDesired(desired, task.id, attempt.toColumn);
    if (strategy === "wait") {
      return { ...base, column: task.column, mark: markFor(attempt.phase) };
    }

    const column =
      attempt.phase === "rejected" && desiredColumn === attempt.toColumn
        ? task.column
        : desiredColumn;
    return { ...base, column, mark: markFor(attempt.phase) };
  });
}
