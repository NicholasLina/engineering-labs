import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { conflictDelayMs, failDelayMs, fastDelayMs, initialTasks, slowDelayMs, type ColumnId, type Task } from "./board.ts";
import { OptimisticUpdatesLab } from "./OptimisticUpdatesLab.tsx";
import type { BoardServer, SaveRequest, SaveResult } from "./server.ts";

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

function saved(id: string, column: ColumnId, revision: number): SaveResult {
  const title = initialTasks().find((task) => task.id === id)?.title ?? id;
  return { type: "confirmed", task: { id, title, column, revision } };
}

function columnRegion(name: string) {
  return screen.getByRole("region", { name });
}

test("optimistic mode moves the card before a successful save confirms", async () => {
  const user = userEvent.setup();
  const { server, calls } = createControllableServer();
  render(<OptimisticUpdatesLab server={server} />);

  await user.click(screen.getByRole("button", { name: "Successful save" }));

  expect(calls[0]?.request).toMatchObject({
    taskId: "brief",
    toColumn: "doing",
    baseRevision: 1,
    delayMs: fastDelayMs,
    fail: false,
  });
  expect(within(columnRegion("In progress")).getByText("Draft the brief")).toBeInTheDocument();
  expect(within(columnRegion("In progress")).getByText("Pending")).toBeInTheDocument();

  await act(async () => {
    calls[0]?.finish(saved("brief", "doing", 2));
  });

  const card = within(columnRegion("In progress")).getByRole("article", { name: "Draft the brief" });
  expect(within(card).getByText("Confirmed")).toBeInTheDocument();
});

test("wait mode holds the card until the successful save confirms", async () => {
  const user = userEvent.setup();
  const { server, calls } = createControllableServer();
  render(<OptimisticUpdatesLab server={server} />);

  await user.click(screen.getByRole("button", { name: "Advanced" }));
  await user.click(screen.getByRole("button", { name: "Wait for save" }));
  await user.click(screen.getByRole("button", { name: "Successful save" }));

  expect(within(columnRegion("To do")).getByText("Draft the brief")).toBeInTheDocument();
  expect(within(columnRegion("To do")).getByText("Pending")).toBeInTheDocument();

  await act(async () => {
    calls[0]?.finish(saved("brief", "doing", 2));
  });

  expect(within(columnRegion("In progress")).getByText("Draft the brief")).toBeInTheDocument();
  expect(within(columnRegion("To do")).queryByText("Draft the brief")).not.toBeInTheDocument();
});

test("a slow save stays pending for its scheduled delay in both modes", async () => {
  const user = userEvent.setup();
  const { server, calls } = createControllableServer();
  render(<OptimisticUpdatesLab server={server} />);

  await user.click(screen.getByRole("button", { name: "Slow save" }));
  expect(calls[0]?.request.delayMs).toBe(slowDelayMs);
  expect(within(columnRegion("In progress")).getByText("Pending")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Advanced" }));
  await user.click(screen.getByRole("button", { name: "Wait for save" }));
  await user.click(screen.getByRole("button", { name: "Slow save" }));

  expect(calls[1]?.request.delayMs).toBe(slowDelayMs);
  expect(within(columnRegion("To do")).getByText("Draft the brief")).toBeInTheDocument();
  expect(within(columnRegion("To do")).getByText("Pending")).toBeInTheDocument();
});

test("a failed save rolls the card back and retry sends it again", async () => {
  const user = userEvent.setup();
  const { server, calls } = createControllableServer();
  render(<OptimisticUpdatesLab server={server} />);

  await user.click(screen.getByRole("button", { name: "Failed save" }));
  expect(calls[0]?.request).toMatchObject({ delayMs: failDelayMs, fail: true, toColumn: "doing" });
  expect(within(columnRegion("In progress")).getByText("Draft the brief")).toBeInTheDocument();

  await act(async () => {
    calls[0]?.finish({
      type: "rejected",
      task: { id: "brief", title: "Draft the brief", column: "todo", revision: 1 },
    });
  });

  expect(within(columnRegion("To do")).getByText("Draft the brief")).toBeInTheDocument();
  expect(within(columnRegion("To do")).getByText("Rolled back")).toBeInTheDocument();
  expect(within(columnRegion("In progress")).getByText("Review the mock")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Retry Draft the brief" }));
  expect(calls[1]?.request).toMatchObject({
    taskId: "brief",
    toColumn: "doing",
    baseRevision: 1,
    fail: false,
  });

  await act(async () => {
    calls[1]?.finish(saved("brief", "doing", 2));
  });
  const retried = within(columnRegion("In progress")).getByRole("article", { name: "Draft the brief" });
  expect(within(retried).getByText("Confirmed")).toBeInTheDocument();
});

test("a manual edit stays pending when another card's slow save is in flight", async () => {
  const user = userEvent.setup();
  const { server, calls } = createControllableServer();
  render(<OptimisticUpdatesLab server={server} />);

  await user.click(screen.getByRole("button", { name: "Slow save" }));
  await user.click(screen.getByRole("button", { name: "Move Label the samples to Done" }));

  expect(calls).toHaveLength(2);
  expect(within(columnRegion("In progress")).getByText("Draft the brief")).toBeInTheDocument();
  expect(within(columnRegion("Done")).getByText("Label the samples")).toBeInTheDocument();

  await act(async () => {
    calls[0]?.finish(saved("brief", "doing", 2));
  });

  expect(within(columnRegion("In progress")).getByText("Draft the brief")).toBeInTheDocument();
  expect(within(columnRegion("Done")).getByText("Label the samples")).toBeInTheDocument();
  expect(within(columnRegion("Done")).getByText("Pending")).toBeInTheDocument();
});

test("keep mine writes the visitor column and use server adopts the server card", async () => {
  const user = userEvent.setup();
  const { server, calls } = createControllableServer();
  render(<OptimisticUpdatesLab server={server} />);

  await user.click(screen.getByRole("button", { name: "Conflicting save" }));
  expect(calls[0]?.request).toMatchObject({
    taskId: "mock",
    toColumn: "done",
    baseRevision: 1,
    delayMs: conflictDelayMs,
    fail: false,
  });
  expect(within(columnRegion("Done")).getByText("Review the mock")).toBeInTheDocument();

  await act(async () => {
    calls[0]?.finish({
      type: "conflict",
      task: { id: "mock", title: "Review the mock", column: "todo", revision: 2 },
    });
  });

  expect(within(columnRegion("Done")).getByText("Conflict")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Use server for Review the mock" }));
  expect(within(columnRegion("To do")).getByText("Review the mock")).toBeInTheDocument();
  expect(calls).toHaveLength(1);

  await user.click(screen.getByRole("button", { name: "Conflicting save" }));
  await act(async () => {
    calls[1]?.finish({
      type: "conflict",
      task: { id: "mock", title: "Review the mock", column: "todo", revision: 2 },
    });
  });
  await user.click(screen.getByRole("button", { name: "Keep mine for Review the mock" }));
  expect(calls[2]?.request).toMatchObject({ baseRevision: 2, toColumn: "done", fail: false });

  await act(async () => {
    calls[2]?.finish(saved("mock", "done", 3));
  });
  const kept = within(columnRegion("Done")).getByRole("article", { name: "Review the mock" });
  expect(within(kept).getByText("Confirmed")).toBeInTheDocument();
});

test("clear during a pending save restores the initial board", async () => {
  const user = userEvent.setup();
  const { server, calls } = createControllableServer();
  render(<OptimisticUpdatesLab server={server} />);

  await user.click(screen.getByRole("button", { name: "Successful save" }));
  await user.click(screen.getByRole("button", { name: "Clear" }));
  await act(async () => {
    calls[0]?.finish(saved("brief", "done", 9));
  });

  expect(within(columnRegion("To do")).getByText("Draft the brief")).toBeInTheDocument();
  expect(within(columnRegion("In progress")).getByText("Review the mock")).toBeInTheDocument();
  expect(within(columnRegion("Done")).getByText("Ship the notes")).toBeInTheDocument();
  expect(screen.queryByText("Pending")).not.toBeInTheDocument();
});

test("fail next rejects one manual move and leaves scenario buttons alone", async () => {
  const user = userEvent.setup();
  const { server, calls } = createControllableServer();
  render(<OptimisticUpdatesLab server={server} />);

  await user.click(screen.getByRole("button", { name: "Advanced" }));
  await user.click(screen.getByRole("switch", { name: "Fail next" }));
  await user.click(screen.getByRole("button", { name: "Successful save" }));
  expect(calls[0]?.request.fail).toBe(false);
  expect(screen.getByRole("switch", { name: "Fail next" })).toHaveAttribute("aria-checked", "true");

  await user.click(screen.getByRole("button", { name: "Move Label the samples to Done" }));
  expect(calls[1]?.request).toMatchObject({ taskId: "samples", toColumn: "done", fail: true });
  expect(screen.getByRole("switch", { name: "Fail next" })).toHaveAttribute("aria-checked", "false");
});

test("the explanation, server readout, and timeline follow a pending save through confirmation", async () => {
  const user = userEvent.setup();
  const { server, calls } = createControllableServer();
  render(<OptimisticUpdatesLab server={server} />);
  const explanation = screen.getByRole("region", { name: "Explanation" });

  expect(within(explanation).getByText("Nothing has been saved yet. Run a scenario, or move a card.")).toBeInTheDocument();
  expect(within(explanation).getAllByText("No saves yet.")).toHaveLength(2);

  await user.click(screen.getByRole("button", { name: "Successful save" }));
  expect(within(explanation).getByText(/scheduled to wait 400 ms/)).toBeInTheDocument();
  expect(within(explanation).getByText("#1 Draft the brief, 400 ms, Pending")).toBeInTheDocument();
  expect(within(explanation).getByText("#1 · Draft the brief · Pending")).toBeInTheDocument();
  expect(within(explanation).getByText("Draft the brief · To do · revision 1")).toBeInTheDocument();
  expect(explanation.querySelector(".save-bar")).toHaveStyle({ width: "100%" });

  await act(async () => {
    calls[0]?.finish(saved("brief", "doing", 2));
  });

  expect(
    within(explanation).getByText(
      "The server accepted Draft the brief in In progress. The revision is now 2. The card is confirmed.",
    ),
  ).toBeInTheDocument();
  expect(within(explanation).getByText("#1 Draft the brief, 400 ms, Confirmed")).toBeInTheDocument();
  expect(within(explanation).getByText("#1 · Draft the brief · Confirmed")).toBeInTheDocument();
  expect(within(explanation).getByText("Draft the brief · In progress · revision 2")).toBeInTheDocument();
});

test("a rollback explains the rejection and lists Rolled back", async () => {
  const user = userEvent.setup();
  const { server, calls } = createControllableServer();
  render(<OptimisticUpdatesLab server={server} />);

  await user.click(screen.getByRole("button", { name: "Failed save" }));
  await act(async () => {
    calls[0]?.finish({
      type: "rejected",
      task: { id: "brief", title: "Draft the brief", column: "todo", revision: 1 },
    });
  });

  const explanation = screen.getByRole("region", { name: "Explanation" });
  expect(within(explanation).getByText(/rejected the move of Draft the brief to In progress/)).toBeInTheDocument();
  expect(within(explanation).getByText(/scheduled to wait 700 ms/)).toBeInTheDocument();
  expect(within(explanation).getByText(/Retry sends Draft the brief to In progress/)).toBeInTheDocument();
  expect(within(explanation).getByText("#1 Draft the brief, 700 ms, Rejected")).toBeInTheDocument();
  expect(within(explanation).getByText("#1 · Draft the brief · Rolled back")).toBeInTheDocument();
});

test("a conflict explains the server revision while the card still shows the local column", async () => {
  const user = userEvent.setup();
  const { server, calls } = createControllableServer();
  render(<OptimisticUpdatesLab server={server} />);

  await user.click(screen.getByRole("button", { name: "Conflicting save" }));
  const explanation = screen.getByRole("region", { name: "Explanation" });
  expect(within(explanation).getByText("Review the mock · To do · revision 2")).toBeInTheDocument();
  expect(within(explanation).getByText(/based on revision 1/)).toBeInTheDocument();
  expect(within(columnRegion("Done")).getByText("Review the mock")).toBeInTheDocument();

  await act(async () => {
    calls[0]?.finish({
      type: "conflict",
      task: { id: "mock", title: "Review the mock", column: "todo", revision: 2 },
    });
  });

  expect(within(explanation).getByText(/Keep mine writes Done onto revision 2/)).toBeInTheDocument();
  expect(within(explanation).getByText("#1 · Review the mock · Conflict")).toBeInTheDocument();
  expect(within(explanation).getByText("#1 Review the mock, 800 ms, Conflict")).toBeInTheDocument();
});

test("clear empties the timeline and says a late save cannot write", async () => {
  const user = userEvent.setup();
  const { server, calls } = createControllableServer();
  render(<OptimisticUpdatesLab server={server} />);

  await user.click(screen.getByRole("button", { name: "Successful save" }));
  await user.click(screen.getByRole("button", { name: "Clear" }));
  await act(async () => {
    calls[0]?.finish(saved("brief", "done", 9));
  });

  const explanation = screen.getByRole("region", { name: "Explanation" });
  expect(
    within(explanation).getByText(
      "Clear restored the initial board and server. A save that was already running cannot write.",
    ),
  ).toBeInTheDocument();
  expect(within(explanation).getAllByText("No saves yet.")).toHaveLength(2);
  expect(within(explanation).getByText("Draft the brief · To do · revision 1")).toBeInTheDocument();
});

test("the keyboard activation keeps focus on the moved control", async () => {
  const user = userEvent.setup();
  const { server } = createControllableServer();
  render(<OptimisticUpdatesLab server={server} />);

  const move = screen.getByRole("button", { name: "Move Draft the brief to In progress" });
  move.focus();
  await user.keyboard("{Enter}");

  const moved = screen.getByRole("button", { name: "Move Draft the brief to In progress" });
  expect(moved).toHaveFocus();
  expect(moved).toHaveAttribute("aria-pressed", "true");
  expect(within(columnRegion("In progress")).getByText("Draft the brief")).toBeInTheDocument();
});
