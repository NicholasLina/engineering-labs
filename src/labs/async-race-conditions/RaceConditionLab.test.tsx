import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { RaceConditionLab, fastDelayMs, slowDelayMs } from "./RaceConditionLab.tsx";
import { requestLaneColor } from "./timeline.ts";
import type { CatalogItem } from "./catalog.ts";
import type { SearchFn, SearchParams } from "./simulateSearch.ts";

type Deferred = {
  params: SearchParams;
  resolve: (items: CatalogItem[]) => void;
  reject: (error: unknown) => void;
};

const reactItem = { id: "react", label: "react" };
const broadMatch = [
  reactItem,
  { id: "redux", label: "redux" },
  { id: "relay", label: "relay" },
  { id: "rest", label: "rest" },
  { id: "rendering", label: "rendering" },
];

function barGeometry(label: string): { start: number; width: number } {
  const row = screen.getByText(label).closest("li");
  const bar = row?.querySelector(".race-bar");
  if (!(bar instanceof HTMLElement)) {
    throw new Error(`Missing bar for ${label}`);
  }

  return {
    start: Number.parseFloat(bar.style.left),
    width: Number.parseFloat(bar.style.width),
  };
}

function createControllableSearch() {
  const calls: Deferred[] = [];
  const search: SearchFn = (params) =>
    new Promise((resolve, reject) => {
      calls.push({ params, resolve, reject });
    });

  return { calls, search };
}

test("naive mode shows the older scenario results after they arrive last", async () => {
  const user = userEvent.setup();
  const { calls, search } = createControllableSearch();
  render(<RaceConditionLab search={search} />);

  const definition = screen.getByText(
    /A race condition is a bug where the outcome depends on timing/,
  );
  const example = screen.getByText(/Search-as-you-type is that situation/);
  expect(definition.compareDocumentPosition(example) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
  expect(
    screen.getByText(/another query's results, or another query's error/),
  ).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Reading the timeline" })).not.toBeInTheDocument();
  expect(
    [...document.querySelectorAll("code")].some((block) => block.textContent?.includes("id !== latest")),
  ).toBe(true);
  for (const title of [
    "Debouncing",
    "Real cancellation",
    "Cache lifetime",
    "In-flight duplicates",
    "Retries",
  ]) {
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText(title).closest("a")).toBeNull();
  }
  expect(screen.getByRole("toolbar", { name: "Scenarios" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Example" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent(
    "Nothing has been issued yet",
  );
  expect(screen.getByRole("button", { name: "Out of order" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Stale error" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Advanced" })).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("button", { name: "Protected" })).not.toBeInTheDocument();
  expect(screen.queryByRole("switch", { name: "Fail next" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Advanced" }));
  expect(
    screen.getAllByText(/The scenario buttons always use 600 ms, then 50 ms/).length,
  ).toBeGreaterThan(0);
  expect(screen.getByRole("button", { name: "Protected" })).toHaveAttribute("aria-pressed", "false");

  await user.click(screen.getByRole("button", { name: "Out of order" }));

  expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("rea");
  expect(calls[0]?.params).toMatchObject({
    query: "re",
    delayMs: slowDelayMs,
    fail: false,
  });
  expect(calls[1]?.params).toMatchObject({
    query: "rea",
    delayMs: fastDelayMs,
    fail: false,
  });

  const timeline = screen.getByRole("region", { name: "Timeline" });
  const slow = barGeometry("#1 re, 600 ms, pending");
  const fast = barGeometry("#2 rea, 50 ms, pending");
  expect(slow.width).toBeGreaterThan(fast.width);
  expect(fast.start).toBeLessThan(slow.start + slow.width);
  expect(slow.start).toBeLessThan(5);
  expect(fast.start).toBeLessThan(5);
  expect(within(timeline).getByText("#1 re, 600 ms, pending")).toBeInTheDocument();

  await act(async () => {
    calls[1]?.resolve([reactItem]);
  });
  expect(screen.getByRole("heading", { name: 'Results for "rea"' })).toBeInTheDocument();

  await act(async () => {
    calls[0]?.resolve(broadMatch);
  });
  expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("rea");
  expect(screen.getByRole("heading", { name: 'Results for "re"' })).toBeInTheDocument();
  expect(
    within(screen.getByRole("list", { name: "Matches" }))
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual(["react", "redux", "relay", "rest", "rendering"]);
  const log = screen.getByRole("region", { name: "Requests" });
  expect(within(log).getByText("#2 · rea · resolved")).toBeInTheDocument();
  expect(within(log).getByText("#1 · re · resolved")).toBeInTheDocument();
  expect(within(timeline).getByText("#1 re, 600 ms, resolved")).toBeInTheDocument();
  expect(within(timeline).getByText("#2 rea, 50 ms, resolved")).toBeInTheDocument();
  const started = within(log).getByText("#1 · re · started");
  const resolved = within(log).getByText("#1 · re · resolved");
  const bar = screen.getByText("#1 re, 600 ms, resolved").closest(".race-lane");
  if (!(bar instanceof HTMLElement)) {
    throw new Error("Missing bar");
  }
  expect(started.style.getPropertyValue("--lane")).toBe(requestLaneColor(1));
  expect(resolved.style.getPropertyValue("--lane")).toBe(started.style.getPropertyValue("--lane"));
  expect(bar.style.getPropertyValue("--lane")).toBe(started.style.getPropertyValue("--lane"));
  expect(requestLaneColor(2)).not.toBe(requestLaneColor(1));
  const inspector = screen.getByRole("region", { name: "Explanation" });
  expect(inspector).toHaveTextContent('The late "re" response replaced the "rea" results');
  expect(inspector).toHaveTextContent("They name different queries");
});

test("protected mode keeps the newer scenario results", async () => {
  const user = userEvent.setup();
  const { calls, search } = createControllableSearch();
  render(<RaceConditionLab search={search} />);

  await user.click(screen.getByRole("button", { name: "Advanced" }));
  await user.click(screen.getByRole("button", { name: "Protected" }));
  expect(screen.getByRole("button", { name: "Protected" })).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getByRole("button", { name: "Out of order" }));
  await act(async () => {
    calls[1]?.resolve([reactItem]);
  });
  await act(async () => {
    calls[0]?.resolve(broadMatch);
  });

  expect(screen.getByRole("heading", { name: 'Results for "rea"' })).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent('1 result for "rea".');
  const log = screen.getByRole("region", { name: "Requests" });
  expect(within(log).getByText("#1 · re · cancel-requested")).toBeInTheDocument();
  expect(within(log).getByText("#1 · re · ignored")).toBeInTheDocument();
  const timeline = screen.getByRole("region", { name: "Timeline" });
  expect(within(timeline).getByText("#1 re, 600 ms, ignored")).toBeInTheDocument();
  expect(within(timeline).getByText("#2 rea, 50 ms, resolved")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent(
    'The late "re" response was ignored',
  );
});

test("the stale-error scenario does not replace protected results", async () => {
  const user = userEvent.setup();
  const { calls, search } = createControllableSearch();
  render(<RaceConditionLab search={search} />);

  await user.click(screen.getByRole("button", { name: "Advanced" }));
  await user.click(screen.getByRole("button", { name: "Protected" }));
  expect(screen.getByRole("button", { name: "Protected" })).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getByRole("button", { name: "Stale error" }));
  expect(calls[0]?.params.fail).toBe(true);
  expect(calls[1]?.params.fail).toBe(false);

  await act(async () => {
    calls[1]?.resolve([reactItem]);
  });
  await act(async () => {
    calls[0]?.reject(new Error("Search failed"));
  });

  expect(screen.getByRole("heading", { name: 'Results for "rea"' })).toBeInTheDocument();
  expect(screen.getByRole("status")).not.toHaveTextContent("Search failed");
  expect(screen.getByText("#1 · re · ignored")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent(
    "It does not say the search failed",
  );
});

test("in order leaves the newer query on screen", async () => {
  const { calls, search } = createControllableSearch();
  render(<RaceConditionLab search={search} />);

  await userEvent.setup().click(screen.getByRole("button", { name: "In order" }));
  expect(calls[0]?.params).toMatchObject({ query: "re", delayMs: fastDelayMs, fail: false });
  expect(calls[1]?.params).toMatchObject({ query: "rea", delayMs: slowDelayMs, fail: false });

  const short = barGeometry("#1 re, 50 ms, pending");
  const long = barGeometry("#2 rea, 600 ms, pending");
  expect(long.width).toBeGreaterThan(short.width);

  await act(async () => {
    calls[0]?.resolve(broadMatch);
  });
  expect(screen.getByRole("heading", { name: 'Results for "re"' })).toBeInTheDocument();

  await act(async () => {
    calls[1]?.resolve([reactItem]);
  });
  expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("rea");
  expect(screen.getByRole("heading", { name: 'Results for "rea"' })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent(
    "the last write happened to be the right one",
  );
});

test("the same query can race without changing the visible matches", async () => {
  const user = userEvent.setup();
  const { calls, search } = createControllableSearch();
  render(<RaceConditionLab search={search} />);

  await user.click(screen.getByRole("button", { name: "Advanced" }));
  await user.click(screen.getByRole("button", { name: "Protected" }));
  await user.click(screen.getByRole("button", { name: "Same query" }));
  expect(calls[0]?.params).toMatchObject({ query: "re", delayMs: slowDelayMs, fail: false });
  expect(calls[1]?.params).toMatchObject({ query: "re", delayMs: fastDelayMs, fail: false });

  await act(async () => {
    calls[1]?.resolve(broadMatch);
  });
  await act(async () => {
    calls[0]?.resolve(broadMatch);
  });

  expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("re");
  expect(screen.getByRole("heading", { name: 'Results for "re"' })).toBeInTheDocument();
  expect(screen.getByText("#1 · re · ignored")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent(
    "The list looks the same as it would have if the late response had written",
  );
});

test("an unknown prefix shows an empty state", async () => {
  const user = userEvent.setup();
  const { calls, search } = createControllableSearch();
  render(<RaceConditionLab search={search} />);

  await user.type(screen.getByRole("searchbox", { name: "Search" }), "zzz");
  expect(calls.at(-1)?.params.query).toBe("zzz");
  await act(async () => {
    calls.at(-1)?.resolve([]);
  });

  expect(screen.getByRole("status")).toHaveTextContent('No matches for "zzz".');
  expect(screen.queryByRole("list", { name: "Matches" })).not.toBeInTheDocument();
});

test("failing the current request shows an error and clears the list", async () => {
  const user = userEvent.setup();
  const { calls, search } = createControllableSearch();
  render(<RaceConditionLab search={search} />);

  await user.click(screen.getByRole("button", { name: "Advanced" }));
  const failNext = screen.getByRole("switch", { name: "Fail next" });
  await user.click(failNext);
  await user.type(screen.getByRole("searchbox", { name: "Search" }), "z");
  expect(calls[0]?.params.fail).toBe(true);
  expect(failNext).toHaveAttribute("aria-checked", "false");

  await act(async () => {
    calls[0]?.reject(new Error("Search failed"));
  });

  expect(screen.getByRole("status")).toHaveTextContent("Search failed");
  expect(screen.queryByRole("list", { name: "Matches" })).not.toBeInTheDocument();
});

test("clearing the query stays idle after a late response", async () => {
  const user = userEvent.setup();
  const { calls, search } = createControllableSearch();
  render(<RaceConditionLab search={search} />);
  const input = screen.getByRole("searchbox", { name: "Search" });

  await user.type(input, "r");
  await user.click(screen.getByRole("button", { name: "Clear" }));

  expect(input).toHaveValue("");
  expect(screen.getByRole("status")).toHaveTextContent("Waiting for a query.");

  const timeline = screen.getByRole("region", { name: "Timeline" });
  const log = screen.getByRole("region", { name: "Requests" });
  expect(within(timeline).getByText("No requests yet.")).toBeInTheDocument();
  expect(within(log).getByText("No requests yet.")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent(
    "cannot write the search window",
  );

  await act(async () => {
    calls[0]?.resolve(broadMatch);
  });
  expect(input).toHaveValue("");
  expect(screen.getByRole("status")).toHaveTextContent("Waiting for a query.");
  expect(screen.queryByRole("heading", { name: /Results for/ })).not.toBeInTheDocument();
  expect(within(timeline).getByText("No requests yet.")).toBeInTheDocument();
  expect(within(log).getByText("No requests yet.")).toBeInTheDocument();
});

test("repeating a query uses the cache", async () => {
  const user = userEvent.setup();
  const { calls, search } = createControllableSearch();
  render(<RaceConditionLab search={search} />);
  const input = screen.getByRole("searchbox", { name: "Search" });

  fireEvent.change(input, { target: { value: "rea" } });
  await act(async () => {
    calls[0]?.resolve([reactItem]);
  });
  await user.click(screen.getByRole("button", { name: "Clear" }));
  fireEvent.change(input, { target: { value: "rea" } });

  expect(calls).toHaveLength(1);
  expect(screen.getByRole("heading", { name: 'Results for "rea"' })).toBeInTheDocument();
  expect(screen.getByText("#2 · rea · cache-hit")).toBeInTheDocument();
  const hit = screen.getByText("#2 rea, 0 ms, cache-hit").closest("li");
  expect(hit?.querySelector(".race-marker")).not.toBeNull();
  expect(hit?.querySelector(".race-bar")).toBeNull();
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent(
    "so this was a cache hit",
  );
});

test("the scenario searches again when those queries are already cached", async () => {
  const user = userEvent.setup();
  const { calls, search } = createControllableSearch();
  render(<RaceConditionLab search={search} />);

  await user.click(screen.getByRole("button", { name: "Out of order" }));
  await act(async () => {
    calls[0]?.resolve(broadMatch);
    calls[1]?.resolve([reactItem]);
  });
  await user.click(screen.getByRole("button", { name: "Out of order" }));

  expect(calls).toHaveLength(4);
  expect(calls[2]?.params.query).toBe("re");
  expect(calls[3]?.params.query).toBe("rea");
});

test("arrow keys widen the sidebar within the clamp", async () => {
  const user = userEvent.setup();
  const { search } = createControllableSearch();
  render(<RaceConditionLab search={search} />);

  const separator = screen.getByRole("separator", { name: "Sidebar width" });
  const lab = document.querySelector(".race-lab");
  if (!(lab instanceof HTMLElement)) {
    throw new Error("Missing lab");
  }

  separator.focus();
  const before = Number.parseFloat(lab.style.getPropertyValue("--lab-sidebar-width"));
  await user.keyboard("{ArrowRight}");
  const after = Number.parseFloat(lab.style.getPropertyValue("--lab-sidebar-width"));

  expect(after).toBeGreaterThan(before);
  expect(after).toBeGreaterThanOrEqual(16);
  expect(after).toBeLessThanOrEqual(40);

  for (let step = 0; step < 30; step += 1) {
    await user.keyboard("{ArrowRight}");
  }
  expect(Number.parseFloat(lab.style.getPropertyValue("--lab-sidebar-width"))).toBe(40);
});
