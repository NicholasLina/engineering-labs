import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { DebounceLab } from "./DebounceLab.tsx";
import { createManualClock, type ManualClock } from "./clock.ts";
import { createSimulatedSearch } from "./simulateSearch.ts";

function renderLab(): ManualClock {
  const clock = createManualClock();
  render(<DebounceLab clock={clock} search={createSimulatedSearch(clock)} />);
  return clock;
}

test("the idle explanation names the search box and keeps advanced collapsed", () => {
  renderLab();

  expect(screen.getByRole("heading", { name: "Debouncing" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to labs" })).toHaveAttribute("href", "#labs");
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent(
    "Nothing has been typed yet.",
  );
  expect(screen.getByRole("searchbox", { name: "Search" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Advanced" })).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("button", { name: "Debounced" })).not.toBeInTheDocument();
  expect(
    [...document.querySelectorAll("code")].some((block) => block.textContent?.includes("clearTimeout")),
  ).toBe(true);
  expect(
    [...document.querySelectorAll("code")].some((block) => block.textContent?.includes("id !== latest")),
  ).toBe(true);
  for (const title of ["Real cancellation", "Cache lifetime", "In-flight duplicates", "Retries"]) {
    expect(screen.getByText(title).closest("a")).toBeNull();
  }
});

test("a debounced burst ends with one search for react", async () => {
  const user = userEvent.setup({ delay: null });
  const clock = renderLab();

  await user.click(screen.getByRole("button", { name: "Advanced" }));
  await user.click(screen.getByRole("button", { name: "Debounced" }));
  await user.click(screen.getByRole("button", { name: "Rapid burst" }));
  act(() => {
    clock.advance(540);
  });

  expect(screen.getByText("Start count: 1")).toBeInTheDocument();
  expect(screen.getByText(/#1 · react · started/)).toBeInTheDocument();
  expect(screen.queryByText(/#2 ·/)).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: 'Results for "react"' })).toBeInTheDocument();
  expect(
    within(screen.getByRole("list", { name: "Matches" }))
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual(["react"]);
});

test("an immediate burst ends with five searches", async () => {
  const user = userEvent.setup({ delay: null });
  const clock = renderLab();

  await user.click(screen.getByRole("button", { name: "Rapid burst" }));
  act(() => {
    clock.advance(240);
  });

  expect(screen.getByText("Start count: 5")).toBeInTheDocument();
  expect(screen.getAllByText(/· started ·/)).toHaveLength(5);
  expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("react");
  expect(screen.getByRole("heading", { name: 'Results for "react"' })).toBeInTheDocument();
});

test("pauses produce two searches", async () => {
  const user = userEvent.setup({ delay: null });
  const clock = renderLab();

  await user.click(screen.getByRole("button", { name: "Advanced" }));
  await user.click(screen.getByRole("button", { name: "Debounced" }));
  await user.click(screen.getByRole("button", { name: "Pauses" }));
  act(() => {
    clock.advance(380);
  });

  expect(screen.getByText("Start count: 1")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: 'Results for "re"' })).toBeInTheDocument();
  expect(
    within(screen.getByRole("list", { name: "Matches" }))
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual(["react", "redux", "relay", "rest", "rendering"]);

  act(() => {
    clock.advance(700);
  });
  expect(screen.getByText("Start count: 2")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: 'Results for "rea"' })).toBeInTheDocument();
  expect(
    within(screen.getByRole("list", { name: "Matches" }))
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual(["react"]);
});

test("clearing a pending debounce window starts nothing", async () => {
  const user = userEvent.setup({ delay: null });
  const clock = renderLab();

  await user.click(screen.getByRole("button", { name: "Advanced" }));
  await user.click(screen.getByRole("button", { name: "Debounced" }));
  await user.click(screen.getByRole("button", { name: "Clear pending" }));
  act(() => {
    clock.advance(400);
  });

  expect(screen.getByText("Start count: 0")).toBeInTheDocument();
  expect(screen.queryByText(/· started ·/)).not.toBeInTheDocument();
  expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("");
  expect(screen.getByRole("status")).toHaveTextContent("Waiting for a query.");
});

test("debounced overlap ignores re and shows rea", async () => {
  const user = userEvent.setup({ delay: null });
  const clock = renderLab();

  await user.click(screen.getByRole("button", { name: "Advanced" }));
  await user.click(screen.getByRole("button", { name: "Debounced" }));
  await user.click(screen.getByRole("button", { name: "Overlap" }));
  act(() => {
    clock.advance(700);
  });

  const ignored = screen.getByText(/#1 · re · ignored/);
  expect(ignored.style.getPropertyValue("--lane")).toBe("var(--lane-1)");
  expect(screen.queryByRole("heading", { name: /Results for/ })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent('Loading results for "rea".');

  act(() => {
    clock.advance(250);
  });
  expect(screen.getByRole("heading", { name: 'Results for "rea"' })).toBeInTheDocument();
  expect(
    within(screen.getByRole("list", { name: "Matches" }))
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual(["react"]);
  expect(screen.getByText(/#2 · rea · resolved/).style.getPropertyValue("--lane")).toBe(
    "var(--lane-2)",
  );
});

test("the burst scenario keeps its 300 ms window when advanced interval changes", async () => {
  const user = userEvent.setup({ delay: null });
  const clock = renderLab();

  await user.click(screen.getByRole("button", { name: "Advanced" }));
  await user.click(screen.getByRole("button", { name: "Debounced" }));
  await user.click(screen.getByRole("button", { name: "600" }));
  await user.click(screen.getByRole("button", { name: "500" }));
  expect(screen.getByRole("button", { name: "600" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "500" })).toHaveAttribute("aria-pressed", "true");

  await user.click(screen.getByRole("button", { name: "Rapid burst" }));
  act(() => {
    clock.advance(459);
  });
  expect(screen.getByText("Start count: 0")).toBeInTheDocument();

  act(() => {
    clock.advance(1);
  });
  expect(screen.getByText("Start count: 1")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: /Results for/ })).not.toBeInTheDocument();

  act(() => {
    clock.advance(80);
  });
  expect(screen.getByRole("heading", { name: 'Results for "react"' })).toBeInTheDocument();
});

test("typing uses the selected strategy", async () => {
  const user = userEvent.setup({ delay: null });
  const clock = renderLab();
  const input = screen.getByRole("searchbox", { name: "Search" });

  await user.type(input, "re");
  expect(screen.getByText("Start count: 2")).toBeInTheDocument();
  expect(screen.getByText(/#1 · r · started/)).toBeInTheDocument();
  expect(screen.getByText(/#2 · re · started/)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Clear" }));
  await user.click(screen.getByRole("button", { name: "Advanced" }));
  await user.click(screen.getByRole("button", { name: "Debounced" }));
  await user.type(input, "rea");

  expect(screen.getByText("Start count: 0")).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Window" })).getByText(/Armed for "rea"/)).toBeInTheDocument();
  act(() => {
    clock.advance(299);
  });
  expect(screen.getByText("Start count: 0")).toBeInTheDocument();
  act(() => {
    clock.advance(1);
  });
  expect(screen.getByText("Start count: 1")).toBeInTheDocument();
  expect(screen.getByText(/· rea · started/)).toBeInTheDocument();
});
