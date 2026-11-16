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

function pathGeometry(label: string): { start: number; width: number } {
  const row = screen.getByText(label).closest("li");
  const path = row?.querySelector(".race-path");
  if (!(path instanceof HTMLElement)) {
    throw new Error(`Missing path for ${label}`);
  }

  return {
    start: Number.parseFloat(path.style.left),
    width: Number.parseFloat(path.style.width),
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

async function skipToSearch(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Skip to search demo" }));
  return user;
}

function messenger(id: number): HTMLElement {
  const node = document.querySelector(`[data-messenger="${id}"]`);
  if (!(node instanceof HTMLElement)) {
    throw new Error(`Missing messenger ${id}`);
  }
  return node;
}

test("naive mode shows the older scenario results after they arrive last", async () => {
  const user = userEvent.setup();
  const { calls, search } = createControllableSearch();
  render(<RaceConditionLab search={search} />);

  const intro = screen.getByText(/Two messengers can each bring the right card/);
  const premise = screen.getByText(/This lighthouse shows the signal/);
  expect(intro.compareDocumentPosition(premise) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
  expect(screen.getByRole("button", { name: "Start walkthrough" })).toBeInTheDocument();
  expect(screen.queryByRole("searchbox", { name: "Search" })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Reading the timeline" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Why this matters" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(screen.getByRole("button", { name: "How to handle it" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(screen.getByRole("button", { name: "Related Concepts" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );

  await user.click(screen.getByRole("button", { name: "Why this matters" }));
  expect(screen.getByText(/older error can wipe a newer success/)).toBeInTheDocument();
  expect(screen.getByText(/This is a race condition/)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "How to handle it" }));
  expect(
    [...document.querySelectorAll("code")].some((block) => block.textContent?.includes("id !== latest")),
  ).toBe(true);
  expect(screen.getByText(/comparing the envelope with the logbook/)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Related Concepts" }));
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
    "Nothing has been sent",
  );

  await user.click(screen.getByRole("button", { name: "Skip to search demo" }));
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent(
    "Nothing has been issued yet",
  );
  expect(screen.getByRole("button", { name: "Out of order" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Stale error" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Advanced" })).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("button", { name: "Protected" })).not.toBeInTheDocument();
  expect(screen.queryByRole("switch", { name: "Fail next" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Advanced" }));
  expect(
    screen.getAllByText(/scenarios always use 600 ms, then 50 ms/).length,
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
  const slow = pathGeometry("#1 re, 600 ms, pending");
  const fast = pathGeometry("#2 rea, 50 ms, pending");
  expect(slow.width).toBeGreaterThan(fast.width);
  expect(fast.start).toBeLessThan(slow.start + slow.width);
  expect(slow.start).toBeLessThan(5);
  expect(fast.start).toBeLessThan(5);
  expect(within(timeline).getByText("#1 re, 600 ms, pending")).toBeInTheDocument();
  const pendingLane = screen.getByText("#1 re, 600 ms, pending").closest(".race-lane");
  expect(pendingLane?.querySelector(".race-envelope")).toHaveAttribute("data-outcome", "pending");
  expect(pendingLane?.querySelector(".race-envelope")).toHaveTextContent("1");
  expect(pendingLane?.querySelector(".race-door")).not.toBeNull();

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
  expect(inspector).toHaveTextContent("The box says rea");
  expect(inspector).toHaveTextContent('The heading says Results for "re"');
  expect(inspector).toHaveTextContent("now showing the older card");
  expect(inspector).toHaveTextContent("rendered react");
  expect(inspector).toHaveTextContent("Choose Protected and run Out of order again");
  expect(screen.getByRole("button", { name: "Show this in the harbour" })).toBeInTheDocument();
});

test("protected mode keeps the newer scenario results", async () => {
  const { calls, search } = createControllableSearch();
  render(<RaceConditionLab search={search} />);
  const user = await skipToSearch();

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
  const ignoredLane = screen.getByText("#1 re, 600 ms, ignored").closest(".race-lane");
  expect(ignoredLane?.querySelector(".race-envelope")).toHaveAttribute("data-outcome", "ignored");
  expect(ignoredLane?.querySelector(".race-envelope")).toHaveTextContent("1");
  expect(ignoredLane?.querySelector(".race-door")).not.toBeNull();
  expect(within(timeline).getByText("#2 rea, 50 ms, resolved")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent(
    'the heading stays Results for "rea"',
  );
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent(
    "cancel-requested when #2 started, then ignored",
  );
});

test("the stale-error scenario does not replace protected results", async () => {
  const { calls, search } = createControllableSearch();
  render(<RaceConditionLab search={search} />);
  const user = await skipToSearch();

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
    "The slip did not put the light out",
  );
});

test("in order leaves the newer query on screen", async () => {
  const { calls, search } = createControllableSearch();
  render(<RaceConditionLab search={search} />);
  const user = await skipToSearch();

  await user.click(screen.getByRole("button", { name: "In order" }));
  expect(calls[0]?.params).toMatchObject({ query: "re", delayMs: fastDelayMs, fail: false });
  expect(calls[1]?.params).toMatchObject({ query: "rea", delayMs: slowDelayMs, fail: false });

  const short = pathGeometry("#1 re, 50 ms, pending");
  const long = pathGeometry("#2 rea, 600 ms, pending");
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
    "happened to be the current assignment",
  );
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent(
    "Request #1 resolved first",
  );
});

test("the same query can race without changing the visible matches", async () => {
  const { calls, search } = createControllableSearch();
  render(<RaceConditionLab search={search} />);
  const user = await skipToSearch();

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
    'the heading stays Results for "re"',
  );
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent(
    "Request #1 was ignored",
  );
});

test("typing and clearing leave the scenario bridge", async () => {
  const user = userEvent.setup();
  const { calls, search } = createControllableSearch();
  render(<RaceConditionLab search={search} />);
  await skipToSearch();
  await user.click(screen.getByRole("button", { name: "Out of order" }));
  await act(async () => {
    calls[0]?.resolve(broadMatch);
    calls[1]?.resolve([reactItem]);
  });
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent("older card");

  await user.type(screen.getByRole("searchbox", { name: "Search" }), "z");
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent("A manual search");
  expect(screen.getByRole("region", { name: "Explanation" })).not.toHaveTextContent("older card");

  await user.clear(screen.getByRole("searchbox", { name: "Search" }));
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent(
    "cannot write the search window",
  );
  expect(screen.queryByRole("button", { name: "Show this in the harbour" })).not.toBeInTheDocument();
});

test("an unknown prefix shows an empty state", async () => {
  const { calls, search } = createControllableSearch();
  render(<RaceConditionLab search={search} />);
  const user = await skipToSearch();

  await user.type(screen.getByRole("searchbox", { name: "Search" }), "zzz");
  expect(calls.at(-1)?.params.query).toBe("zzz");
  await act(async () => {
    calls.at(-1)?.resolve([]);
  });

  expect(screen.getByRole("status")).toHaveTextContent('No matches for "zzz".');
  expect(screen.queryByRole("list", { name: "Matches" })).not.toBeInTheDocument();
});

test("failing the current request shows an error and clears the list", async () => {
  const { calls, search } = createControllableSearch();
  render(<RaceConditionLab search={search} />);
  const user = await skipToSearch();

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
  const { calls, search } = createControllableSearch();
  render(<RaceConditionLab search={search} />);
  const user = await skipToSearch();
  const input = screen.getByRole("searchbox", { name: "Search" });

  await user.type(input, "r");
  await user.clear(input);

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
  const { calls, search } = createControllableSearch();
  render(<RaceConditionLab search={search} />);
  const user = await skipToSearch();
  const input = screen.getByRole("searchbox", { name: "Search" });

  fireEvent.change(input, { target: { value: "rea" } });
  await act(async () => {
    calls[0]?.resolve([reactItem]);
  });
  await user.clear(input);
  fireEvent.change(input, { target: { value: "rea" } });

  expect(calls).toHaveLength(1);
  expect(screen.getByRole("heading", { name: 'Results for "rea"' })).toBeInTheDocument();
  expect(screen.getByText("#2 · rea · cache-hit")).toBeInTheDocument();
  const hit = screen.getByText("#2 rea, 0 ms, cache-hit").closest("li");
  expect(hit?.querySelector(".race-marker")).not.toBeNull();
  expect(hit?.querySelector(".race-path")).toBeNull();
  expect(hit?.querySelector(".race-envelope")).toBeNull();
  expect(hit?.querySelector(".race-door")).toBeNull();
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent(
    "so this was a cache hit",
  );
});

test("the scenario searches again when those queries are already cached", async () => {
  const { calls, search } = createControllableSearch();
  render(<RaceConditionLab search={search} />);
  const user = await skipToSearch();

  await user.click(screen.getByRole("button", { name: "Out of order" }));
  await act(async () => {
    calls[0]?.resolve(broadMatch);
    calls[1]?.resolve([reactItem]);
  });
  await user.click(screen.getByRole("button", { name: "Out of order" }));

  expect(calls).toHaveLength(4);
  expect(calls[2]?.params.query).toBe("re");
  expect(calls[3]?.params.query).toBe("rea");
  const timeline = screen.getByRole("region", { name: "Timeline" });
  const log = screen.getByRole("region", { name: "Requests" });
  expect(within(timeline).queryByText(/#1 /)).not.toBeInTheDocument();
  expect(within(timeline).getByText("#3 re, 600 ms, pending")).toBeInTheDocument();
  expect(within(timeline).getByText("#4 rea, 50 ms, pending")).toBeInTheDocument();
  expect(within(log).queryByText(/#1 ·/)).not.toBeInTheDocument();
  expect(within(log).getByText("#3 · re · started")).toBeInTheDocument();
  expect(within(log).getByText("#4 · rea · started")).toBeInTheDocument();
});

test("timeline and requests sit above the explanation", async () => {
  const { search } = createControllableSearch();
  render(<RaceConditionLab search={search} />);
  expect(screen.queryByRole("region", { name: "Timeline" })).not.toBeInTheDocument();
  await skipToSearch();

  const timeline = screen.getByRole("region", { name: "Timeline" });
  const explanation = screen.getByRole("region", { name: "Explanation" });
  expect(timeline.compareDocumentPosition(explanation) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
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

test("the walkthrough pauses before the late card and back restores that pause", async () => {
  const user = userEvent.setup();
  const { calls, search } = createControllableSearch();
  render(<RaceConditionLab search={search} />);

  await user.click(screen.getByRole("button", { name: "Start walkthrough" }));
  expect(screen.getByText("Step 1 of 6")).toBeInTheDocument();
  expect(messenger(1)).toHaveAttribute("data-progress", "en-route");
  expect(messenger(1)).toHaveAttribute("data-route", "long");
  expect(document.querySelector("[data-messenger='2']")).toBeNull();
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent(
    "The number on the envelope is the request ID",
  );

  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Step 2 of 6")).toBeInTheDocument();
  expect(messenger(1)).toHaveAttribute("data-progress", "en-route");
  expect(messenger(2)).toHaveAttribute("data-progress", "en-route");
  expect(messenger(2)).toHaveAttribute("data-route", "short");
  expect(screen.getAllByText("Awaiting report").length).toBeGreaterThan(0);
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent(
    "latest user intent",
  );

  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getAllByText("Blue · East").length).toBeGreaterThan(0);
  expect(screen.getByRole("list", { name: "Logbook" })).toHaveTextContent(
    "#2 · East · blue card · applied",
  );

  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Step 4 of 6")).toBeInTheDocument();
  expect(screen.getByText(/What colour will the lamp show next/)).toBeInTheDocument();
  expect(messenger(1)).toHaveAttribute("data-progress", "door");
  expect(messenger(1)).toHaveAttribute("data-carrying", "card");
  expect(screen.getAllByText("Blue · East").length).toBeGreaterThan(0);
  expect(screen.queryByText("Amber · West")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Amber" }));
  expect(screen.getByRole("button", { name: "Amber" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Next" })).toHaveFocus();
  expect(screen.queryByText("Amber · West")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getAllByText(/You chose amber/).length).toBeGreaterThan(0);
  expect(screen.getAllByText("Amber · West").length).toBeGreaterThan(0);
  expect(screen.getByText("#2 · East channel")).toBeInTheDocument();
  expect(screen.getByRole("list", { name: "Logbook" })).toHaveTextContent(
    "#1 · West · amber card · applied",
  );
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent(
    "The last arrival overwrote a newer answer",
  );

  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByText("Step 4 of 6")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Amber" })).toHaveAttribute("aria-pressed", "true");
  expect(messenger(1)).toHaveAttribute("data-progress", "door");
  expect(screen.queryByText("Amber · West")).not.toBeInTheDocument();
  expect(screen.getByRole("list", { name: "Logbook" })).not.toHaveTextContent(
    "#1 · West · amber card · applied",
  );
  expect(screen.getByRole("list", { name: "Logbook" })).toHaveTextContent(
    "#1 · West · amber card · at the door",
  );

  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Step 6 of 6")).toBeInTheDocument();
  expect(screen.getAllByText("Blue · East").length).toBeGreaterThan(0);
  expect(messenger(1)).toHaveAttribute("data-progress", "set-aside");
  expect(screen.getByRole("list", { name: "Logbook" })).toHaveTextContent(
    "#1 · West · amber card · received and ignored",
  );
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent(
    "the keeper also checks the dispatch number",
  );

  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByText("Step 5 of 6")).toBeInTheDocument();
  expect(screen.getAllByText("Amber · West").length).toBeGreaterThan(0);
  expect(screen.getAllByText(/You chose amber/).length).toBeGreaterThan(0);

  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "See it in search" }));
  expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("rea");
  expect(calls[0]?.params).toMatchObject({ query: "re", delayMs: slowDelayMs, fail: false });
  expect(calls[1]?.params).toMatchObject({ query: "rea", delayMs: fastDelayMs, fail: false });
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent(
    "still travelling",
  );

  await act(async () => {
    calls[1]?.resolve([reactItem]);
  });
  expect(screen.getByRole("heading", { name: 'Results for "rea"' })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent(
    "has not returned",
  );

  await act(async () => {
    calls[0]?.resolve(broadMatch);
  });
  expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("rea");
  expect(screen.getByRole("heading", { name: 'Results for "re"' })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent(
    "now showing the older card",
  );

  await user.click(screen.getByRole("button", { name: "Show this in the harbour" }));
  expect(screen.getByText("Step 1 of 6")).toBeInTheDocument();
  expect(screen.queryByRole("searchbox", { name: "Search" })).not.toBeInTheDocument();
});

test("replay and back return to the earlier harbour scene", async () => {
  const user = userEvent.setup();
  render(<RaceConditionLab search={createControllableSearch().search} />);

  await user.click(screen.getByRole("button", { name: "Start walkthrough" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Replay" }));
  expect(screen.getByText("Step 1 of 6")).toBeInTheDocument();
  expect(document.querySelector("[data-messenger='2']")).toBeNull();
  expect(messenger(1)).toHaveAttribute("data-progress", "en-route");

  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByRole("button", { name: "Start walkthrough" })).toBeInTheDocument();
  expect(screen.queryByText("Step 1 of 6")).not.toBeInTheDocument();
});

test("show the outcome reveals the amber lamp without a prediction", async () => {
  const user = userEvent.setup();
  render(<RaceConditionLab search={createControllableSearch().search} />);
  await user.click(screen.getByRole("button", { name: "Start walkthrough" }));
  for (let step = 0; step < 3; step += 1) {
    await user.click(screen.getByRole("button", { name: "Next" }));
  }
  await user.click(screen.getByRole("button", { name: "Show the outcome" }));
  expect(screen.getByRole("button", { name: "Next" })).toHaveFocus();
  expect(screen.getByRole("button", { name: "Amber" })).toHaveAttribute("aria-pressed", "false");
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.queryByText(/You chose/)).not.toBeInTheDocument();
  expect(screen.getAllByText("Amber · West").length).toBeGreaterThan(0);
});

test("arrow keys move the walkthrough only from the step controls", async () => {
  const user = userEvent.setup();
  render(<RaceConditionLab search={createControllableSearch().search} />);
  await user.click(screen.getByRole("button", { name: "Start walkthrough" }));

  screen.getByRole("button", { name: "Next" }).focus();
  await user.keyboard("{ArrowRight}");
  expect(screen.getByText("Step 2 of 6")).toBeInTheDocument();

  screen.getByRole("button", { name: "Back" }).focus();
  await user.keyboard("{ArrowLeft}");
  expect(screen.getByText("Step 1 of 6")).toBeInTheDocument();

  for (let step = 0; step < 3; step += 1) {
    await user.click(screen.getByRole("button", { name: "Next" }));
  }
  screen.getByRole("button", { name: "Blue" }).focus();
  await user.keyboard("{ArrowRight}");
  expect(screen.getByText("Step 4 of 6")).toBeInTheDocument();
});

test("each scenario starts its harbour variation where the outcome differs", async () => {
  const user = userEvent.setup();
  render(<RaceConditionLab search={createControllableSearch().search} />);

  await user.click(screen.getByRole("button", { name: "In order" }));
  expect(screen.getByText(/Messenger #1 takes the shorter route/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Start walkthrough" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Start walkthrough" }));
  expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
  expect(messenger(1)).toHaveAttribute("data-route", "short");
  expect(messenger(2)).toHaveAttribute("data-route", "long");
  expect(screen.getAllByText("Awaiting report").length).toBeGreaterThan(0);

  await user.click(screen.getByRole("button", { name: "Stale error" }));
  expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
  expect(screen.getAllByText("Blue · East").length).toBeGreaterThan(0);
  expect(messenger(1)).toHaveAttribute("data-progress", "en-route");
  expect(messenger(1)).toHaveAttribute("data-carrying", "none");

  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText(/What happens to the blue light/)).toBeInTheDocument();
  expect(document.querySelector(".harbour-lamp")).toHaveAttribute("data-signal", "blue");
  await user.click(screen.getByRole("button", { name: "It goes dark" }));
  expect(document.querySelector(".harbour-lamp")).toHaveAttribute("data-signal", "blue");
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getAllByText(/You chose dark/).length).toBeGreaterThan(0);
  expect(screen.getAllByText("No signal").length).toBeGreaterThan(0);
  expect(screen.getByText("#2 · East channel")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getAllByText("Blue · East").length).toBeGreaterThan(0);
  expect(screen.getByRole("list", { name: "Logbook" })).toHaveTextContent(
    "failure slip · received and ignored",
  );

  await user.click(screen.getByRole("button", { name: "Same query" }));
  expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
  expect(screen.getByText("#2 · West channel")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("#1")).toBeInTheDocument();
  expect(screen.getByRole("list", { name: "Logbook" })).toHaveTextContent(
    "#1 · West · amber card · applied",
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("#2")).toBeInTheDocument();
  expect(screen.getByRole("list", { name: "Logbook" })).toHaveTextContent(
    "#1 · West · amber card · received and ignored",
  );
  expect(screen.queryByText("Blue · East")).not.toBeInTheDocument();
});

test("reduced motion keeps a travelling messenger on the route", async () => {
  const user = userEvent.setup();
  const original = window.matchMedia;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  try {
    render(<RaceConditionLab search={createControllableSearch().search} />);
    await user.click(screen.getByRole("button", { name: "Start walkthrough" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(document.querySelector(".harbour-layout")).toHaveAttribute("data-motion", "reduced");
    expect(messenger(1)).toHaveAttribute("data-progress", "en-route");
    expect(messenger(2)).toHaveAttribute("data-progress", "en-route");
    expect(screen.getByText("Step 2 of 6")).toBeInTheDocument();
    expect(screen.getAllByText("Awaiting report").length).toBeGreaterThan(0);
  } finally {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: original });
  }
});
