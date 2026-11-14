import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { CancellationLab } from "./CancellationLab.tsx";
import { createManualClock, type ManualClock } from "./clock.ts";
import { manualSearchDelayMs } from "./simulateSearch.ts";

function renderLab() {
  const clock = createManualClock();
  render(<CancellationLab clock={clock} />);
  return clock;
}

function advance(clock: ManualClock, ms: number) {
  act(() => {
    clock.advance(ms);
  });
}

test("the idle simulation names search and keeps advanced collapsed", async () => {
  renderLab();

  expect(screen.getByRole("heading", { name: "Request Cancellation" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent(
    "Nothing has been requested yet.",
  );
  expect(screen.getByRole("status")).toHaveTextContent("Waiting for a query.");
  expect(screen.getByRole("status")).toHaveTextContent("The transport is a simulation.");
  expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("");
  expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  expect(screen.getAllByText(/Aborting this simulated timer does not undo server work/).length).toBeGreaterThan(0);
  expect(screen.getByText(/Lab 1's simulator finishes its delay on purpose/)).toBeInTheDocument();
  expect(screen.getByText(/This simulation clears the timer and rejects/)).toBeInTheDocument();
  expect(
    [...document.querySelectorAll("code")].some((block) => block.textContent?.includes("id !== latest")),
  ).toBe(true);
  for (const title of [
    "Debouncing",
    "Cache lifetime",
    "In-flight duplicates",
    "Retries",
    "Server-side effects",
  ]) {
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText(title).closest("a")).toBeNull();
  }

  expect(screen.getByRole("button", { name: "Advanced" })).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("button", { name: "Ignore" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Abort and guard" })).not.toBeInTheDocument();
  expect(screen.queryByRole("switch", { name: "Fail next" })).not.toBeInTheDocument();

  await userEvent.setup().click(screen.getByRole("button", { name: "Advanced" }));
  expect(screen.getByRole("button", { name: "Ignore" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Abort and guard" })).toHaveAttribute("aria-pressed", "false");
});

test("ignore mode replace keeps rea and records the slow lifetime", async () => {
  const user = userEvent.setup();
  const clock = renderLab();

  await user.click(screen.getByRole("button", { name: "Replace" }));
  advance(clock, 600);

  expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("rea");
  expect(screen.getByRole("heading", { name: 'Results for "rea"' })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: 'Results for "re"' })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent('1 result for "rea".');
  expect(
    within(screen.getByRole("list", { name: "Matches" }))
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual(["react"]);

  const requests = screen.getByRole("region", { name: "Requests" });
  const rows = within(requests).getAllByRole("listitem");
  expect(rows[0]).toHaveTextContent("#1 re");
  expect(rows[0]).toHaveTextContent("planned 600 ms");
  expect(rows[0]).toHaveTextContent("lifetime 600 ms");
  expect(rows[0]).toHaveTextContent("ignored");
  expect(rows[1]).toHaveTextContent("lifetime 80 ms");
  expect(rows[0]?.style.getPropertyValue("--lane")).toBe("var(--lane-1)");
  expect(rows[1]?.style.getPropertyValue("--lane")).toBe("var(--lane-2)");

  const log = screen.getByRole("region", { name: "Log" });
  expect(within(log).getByText("t+600 ms · #1 · re · completed")).toBeInTheDocument();
  expect(within(log).getByText("t+600 ms · #1 · re · ignored")).toBeInTheDocument();
  expect(within(log).getByText("t+80 ms · #2 · rea · completed")).toBeInTheDocument();
});

test("abort mode replace aborts the first request and keeps rea", async () => {
  const user = userEvent.setup();
  const clock = renderLab();

  await user.click(screen.getByRole("button", { name: "Advanced" }));
  await user.click(screen.getByRole("button", { name: "Abort and guard" }));
  expect(screen.getByRole("button", { name: "Abort and guard" })).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getByRole("button", { name: "Replace" }));
  advance(clock, 600);

  expect(screen.getByRole("heading", { name: 'Results for "rea"' })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: 'Results for "re"' })).not.toBeInTheDocument();
  expect(
    within(screen.getByRole("list", { name: "Matches" }))
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual(["react"]);

  const requests = screen.getByRole("region", { name: "Requests" });
  const rows = within(requests).getAllByRole("listitem");
  expect(rows[0]).toHaveTextContent("aborted");
  expect(rows[0]).toHaveTextContent("lifetime 0 ms");
  expect(rows[1]).toHaveTextContent("#2 rea");
  expect(rows[1]).toHaveTextContent("lifetime 80 ms");
  expect(screen.getByRole("region", { name: "Log" })).toHaveTextContent("aborted");
});

test("cancel early in abort mode aborts and shows no results", async () => {
  const user = userEvent.setup();
  renderLab();

  await user.click(screen.getByRole("button", { name: "Advanced" }));
  await user.click(screen.getByRole("button", { name: "Abort and guard" }));
  await user.click(screen.getByRole("button", { name: "Cancel early" }));

  expect(screen.queryByRole("heading", { name: /Results for/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "Matches" })).not.toBeInTheDocument();
  const requests = screen.getByRole("region", { name: "Requests" });
  expect(within(requests).getByRole("listitem")).toHaveTextContent("aborted");
  expect(within(requests).getByRole("listitem")).toHaveTextContent("lifetime 0 ms");
  const log = screen.getByRole("region", { name: "Log" });
  expect(within(log).getByText(/abort-requested/)).toBeInTheDocument();
  expect(within(log).getByText(/· aborted/)).toBeInTheDocument();
  expect(screen.getByRole("status")).not.toHaveTextContent("Search failed");
});

test("cancel late stays completed and does not record an abort", async () => {
  const user = userEvent.setup();
  const clock = renderLab();

  await user.click(screen.getByRole("button", { name: "Cancel late" }));
  advance(clock, 0);

  const requests = screen.getByRole("region", { name: "Requests" });
  expect(within(requests).getByRole("listitem")).toHaveTextContent("completed");
  expect(requests).not.toHaveTextContent("aborted");
  const log = screen.getByRole("region", { name: "Log" });
  expect(within(log).getByText("t+0 ms · #1 · re · completed")).toBeInTheDocument();
  expect(log).not.toHaveTextContent("aborted");
  expect(log).not.toHaveTextContent("abort-requested");
  expect(screen.getByRole("heading", { name: 'Results for "re"' })).toBeInTheDocument();
});

test("clear pending in ignore mode stays idle after the timer", async () => {
  const user = userEvent.setup();
  const clock = renderLab();

  await user.click(screen.getByRole("button", { name: "Clear pending" }));
  expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("");
  advance(clock, 600);

  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent(
    "Nothing has been requested yet.",
  );
  expect(screen.getByRole("status")).toHaveTextContent("Waiting for a query.");
  expect(screen.queryByRole("heading", { name: /Results for/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "Matches" })).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Requests" })).toHaveTextContent("No requests yet.");
  expect(screen.getByRole("region", { name: "Log" })).toHaveTextContent("No events yet.");
});

test("fail next on a manual query shows Search failed and not an abort", async () => {
  const user = userEvent.setup();
  const clock = renderLab();

  await user.click(screen.getByRole("button", { name: "Advanced" }));
  const failNext = screen.getByRole("switch", { name: "Fail next" });
  await user.click(failNext);
  await user.type(screen.getByRole("searchbox", { name: "Search" }), "z");
  expect(failNext).toHaveAttribute("aria-checked", "false");
  advance(clock, manualSearchDelayMs);

  expect(screen.getByRole("status")).toHaveTextContent("Search failed");
  expect(screen.getByRole("status")).not.toHaveTextContent("aborted");
  const requests = screen.getByRole("region", { name: "Requests" });
  expect(requests).toHaveTextContent("failed");
  expect(requests).not.toHaveTextContent("aborted");
  const log = screen.getByRole("region", { name: "Log" });
  expect(log).toHaveTextContent("failed");
  expect(log).not.toHaveTextContent("aborted");
  expect(screen.queryByRole("list", { name: "Matches" })).not.toBeInTheDocument();
});
