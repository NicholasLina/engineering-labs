import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { GuidedSearchScene } from "./GuidedSearchScene.tsx";
import { createGuidedSearch, guidedSearchById } from "./guidedSearch.ts";
import { applySchedule, scenarios } from "./scenarios.ts";

test("a guided delivery is what resolves the promise", async () => {
  const { rerender } = render(<GuidedSearchScene step={guidedSearchById("naive-send-2")} />);

  expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("rea");
  expect(screen.queryByRole("heading", { name: /Results for/ })).not.toBeInTheDocument();
  expect(document.querySelector(".race-lesson-search")).toHaveAttribute(
    "data-outcomes",
    "1:pending 2:pending",
  );

  rerender(<GuidedSearchScene key="deliver-1" step={guidedSearchById("naive-deliver-1")} />);
  expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("rea");
  expect(await screen.findByRole("heading", { name: 'Results for "re"' })).toBeInTheDocument();
});

test("the protected guided run keeps the latest answer and ignores request 1", async () => {
  render(<GuidedSearchScene step={guidedSearchById("protected-deliver-1")} />);

  expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("rea");
  expect(await screen.findByRole("heading", { name: 'Results for "rea"' })).toBeInTheDocument();
  expect(document.querySelector(".race-lesson-search")).toHaveAttribute(
    "data-outcomes",
    "1:ignored 2:resolved",
  );
  expect(applySchedule(scenarios.order, "protected").ignoredIds).toEqual([1]);
});

test("a guided promise from a step the learner left does not resolve", async () => {
  const player = createGuidedSearch();
  const ticket = player.begin();
  let settled = false;
  void player.search({
    query: "re",
    signal: new AbortController().signal,
    delayMs: 1,
    fail: false,
  }).then(() => {
    settled = true;
  });
  player.invalidate();
  player.deliver("re", ticket);
  await Promise.resolve();
  expect(settled).toBe(false);
});
