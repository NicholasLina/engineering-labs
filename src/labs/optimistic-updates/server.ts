import { initialTasks, type ColumnId, type Task } from "./board.ts";

export type SaveRequest = {
  taskId: string;
  baseRevision: number;
  toColumn: ColumnId;
  delayMs: number;
  fail: boolean;
};

export type SaveResult =
  | { type: "confirmed"; task: Task }
  | { type: "rejected"; task: Task }
  | { type: "conflict"; task: Task }
  | { type: "ignored" };

export type BoardServer = {
  snapshot(): Task[];
  generation(): number;
  save(request: SaveRequest): Promise<SaveResult>;
  replace(taskId: string, column: ColumnId): Task;
  reset(): void;
};

function cloneTasks(tasks: readonly Task[]): Task[] {
  return tasks.map((task) => ({ ...task }));
}

export function createBoardServer(seed: readonly Task[] = initialTasks()): BoardServer {
  const origin = cloneTasks(seed);
  let generation = 0;
  let tasks = cloneTasks(origin);

  function taskById(taskId: string): Task {
    const task = tasks.find((entry) => entry.id === taskId);
    if (!task) {
      throw new Error(`Unknown task ${taskId}`);
    }
    return task;
  }

  return {
    snapshot() {
      return cloneTasks(tasks);
    },
    generation() {
      return generation;
    },
    replace(taskId, column) {
      const task = taskById(taskId);
      task.column = column;
      task.revision += 1;
      return { ...task };
    },
    reset() {
      generation += 1;
      tasks = cloneTasks(origin);
    },
    save(request) {
      const captured = generation;
      return new Promise((resolve) => {
        setTimeout(() => {
          if (captured !== generation) {
            resolve({ type: "ignored" });
            return;
          }

          const task = taskById(request.taskId);
          if (request.fail) {
            resolve({ type: "rejected", task: { ...task } });
            return;
          }

          if (task.revision !== request.baseRevision) {
            resolve({ type: "conflict", task: { ...task } });
            return;
          }

          task.column = request.toColumn;
          task.revision += 1;
          resolve({ type: "confirmed", task: { ...task } });
        }, request.delayMs);
      });
    },
  };
}
