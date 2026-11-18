import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { RaceConditionLab, fastDelayMs, slowDelayMs } from "./RaceConditionLab.tsx";
import { applySchedule, scenarios } from "./scenarios.ts";
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
  await user.click(screen.getByRole("button", { name: "Skip to exploration" }));
  return user;
}

function messenger(id: number): Element {
  const node = document.querySelector(`[data-messenger="${id}"]`);
  if (!node) {
    throw new Error(`Missing messenger ${id}`);
  }
  return node;
}

test("naive mode shows the older scenario results after they arrive last", async () => {
  const user = userEvent.setup();
  const { calls, search } = createControllableSearch();
  render(<RaceConditionLab search={search} />);

  expect(document.querySelector(".race-lesson")).toHaveAttribute("data-step-id", "meet-keeper");
  expect(screen.getByRole("button", { name: "Skip to exploration" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  expect(screen.queryByRole("separator", { name: "Sidebar width" })).not.toBeInTheDocument();
  expect(screen.queryByRole("toolbar", { name: "Scenarios" })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Explanation" })).not.toBeInTheDocument();
  expect(screen.queryByRole("searchbox", { name: "Search" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Why this matters" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Skip to exploration" }));
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
  expect(screen.getByRole("region", { name: "Example" })).toBeInTheDocument();

  expect(screen.getByRole("toolbar", { name: "Scenarios" })).toBeInTheDocument();
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
  expect(screen.getByRole("button", { name: "Show this in the lighthouse" })).toBeInTheDocument();
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
  expect(screen.queryByRole("button", { name: "Show this in the lighthouse" })).not.toBeInTheDocument();
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
  await user.click(screen.getByRole("button", { name: "Skip to exploration" }));

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

function lessonId(): string | null {
  return document.querySelector(".race-lesson")?.getAttribute("data-step-id") ?? null;
}

async function reachLesson(
  user: ReturnType<typeof userEvent.setup>,
  id: string,
) {
  for (let guard = 0; guard < 40 && lessonId() !== id; guard += 1) {
    const primary = document.querySelector(".ui-button-primary");
    if (!(primary instanceof HTMLButtonElement)) {
      throw new Error("Missing lesson action");
    }
    await user.click(primary);
  }
  expect(lessonId()).toBe(id);
}

test("the guided lesson shows the late amber light before the checked replay", async () => {
  const user = userEvent.setup();
  render(<RaceConditionLab search={createControllableSearch().search} />);

  expect(lessonId()).toBe("meet-keeper");
  expect(screen.getByRole("heading", { name: "A keeper and two stations" })).not.toHaveFocus();
  expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  expect(document.querySelector("[data-messenger]")).toBeNull();
  expect(document.querySelector("[data-station='west']")).not.toBeNull();
  expect(document.querySelector("[data-station='east']")).not.toBeNull();
  expect(screen.queryByRole("separator", { name: "Sidebar width" })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Explanation" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Choose West" }));
  expect(lessonId()).toBe("assign-west");
  expect(screen.getByRole("heading", { name: "Assignment #1" })).toHaveFocus();
  expect(screen.getByText("#1 · West")).toBeInTheDocument();
  expect(document.querySelector("[data-messenger]")).toBeNull();

  await user.click(screen.getByRole("button", { name: "Send messenger #1" }));
  expect(lessonId()).toBe("messenger-1-away");
  expect(messenger(1)).toHaveAttribute("data-progress", "en-route");
  expect(messenger(1)).toHaveAttribute("data-route", "long");
  expect(messenger(1)).toHaveAttribute("data-card", "");
  expect(screen.getByText("Waiting for a report")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Change the assignment to East" }));
  expect(lessonId()).toBe("assignment-east");
  expect(screen.getByText("#2 · East")).toBeInTheDocument();
  expect(document.querySelector("[data-messenger='2']")).toBeNull();

  await user.click(screen.getByRole("button", { name: "Send messenger #2" }));
  expect(messenger(2)).toHaveAttribute("data-progress", "en-route");
  expect(messenger(2)).toHaveAttribute("data-route", "short");
  expect(messenger(2)).toHaveAttribute("data-card", "");

  await user.click(screen.getByRole("button", { name: "Receive East's report" }));
  expect(lessonId()).toBe("east-applied");
  expect(document.querySelector(".harbour-lamp")).toHaveAttribute("data-signal", "blue");
  expect(screen.getByText("Blue · East · from #2")).toBeInTheDocument();
  expect(screen.getByText("#2 · East")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Bring back messenger #1" }));
  expect(lessonId()).toBe("predict-late");
  expect(messenger(1)).toHaveAttribute("data-progress", "door");
  expect(messenger(1)).toHaveAttribute("data-card", "amber");
  expect(document.querySelector(".harbour-lamp")).toHaveAttribute("data-signal", "blue");

  await user.click(screen.getByRole("button", { name: "It turns amber" }));
  expect(screen.getByRole("button", { name: "It turns amber" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Show what happens" })).toHaveFocus();
  expect(lessonId()).toBe("predict-late");

  await user.click(screen.getByRole("button", { name: "Show what happens" }));
  expect(lessonId()).toBe("late-applied");
  expect(document.querySelector(".harbour-lamp")).toHaveAttribute("data-signal", "amber");
  expect(screen.getByText("#2 · East")).toBeInTheDocument();
  expect(screen.getAllByText(/You chose amber/).length).toBeGreaterThan(0);
  const explanation = screen.getAllByText(/wrong for the task the keeper has now/)
    .find((node) => node.classList.contains("harbour-caption"));
  expect(explanation).toBeTruthy();
  expect(explanation).not.toHaveTextContent("You chose");

  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(lessonId()).toBe("predict-late");
  expect(document.querySelector(".harbour-lamp")).toHaveAttribute("data-signal", "blue");
  expect(screen.getByRole("button", { name: "It turns amber" })).toHaveAttribute("aria-pressed", "true");

  await user.click(screen.getByRole("button", { name: "Show what happens" }));
  await user.click(screen.getByRole("button", { name: "Why did this happen?" }));
  expect(lessonId()).toBe("name-race");
  expect(screen.getByText("Sent: #1, then #2")).toBeInTheDocument();
  expect(screen.getByText("Returned: #2, then #1")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Give the keeper a better rule" }));
  expect(lessonId()).toBe("explain-check");
  expect(document.querySelector(".harbour-lamp")).toHaveAttribute("data-signal", "amber");

  await user.click(screen.getByRole("button", { name: "Replay with this rule" }));
  expect(lessonId()).toBe("replay-west");
  expect(screen.getAllByText(/same example is starting over/).length).toBeGreaterThan(0);
  expect(document.querySelector(".harbour-lamp")).toHaveAttribute("data-signal", "awaiting");
  expect(messenger(1)).toHaveAttribute("data-card", "");

  await user.click(screen.getByRole("button", { name: "Change the assignment to East" }));
  expect(lessonId()).toBe("replay-east-assigned");
  expect(document.querySelector("[data-messenger='2']")).toBeNull();
  expect(screen.getByText("#2 · East")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Send messenger #2" }));
  await user.click(screen.getByRole("button", { name: "Receive East's report" }));
  await user.click(screen.getByRole("button", { name: "Bring back messenger #1" }));
  expect(lessonId()).toBe("replay-west-set-aside");
  expect(document.querySelector(".harbour-lamp")).toHaveAttribute("data-signal", "blue");
  expect(screen.getByRole("region", { name: "Earlier reports" })).toHaveTextContent("#1 · Amber · West");
  expect(screen.getByText("Blue · East · from #2")).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Explanation" })).not.toBeInTheDocument();
});

function readout(label: string): HTMLElement {
  const found = [...document.querySelectorAll<HTMLElement>(".race-readout")]
    .find((item) => item.querySelector("span, h3")?.textContent === label);
  if (!found) {
    throw new Error(`Missing readout ${label}`);
  }
  return found;
}

test("the lesson readouts hold their place and flag a light that left its assignment", async () => {
  const user = userEvent.setup();
  render(<RaceConditionLab search={createControllableSearch().search} />);

  expect(readout("Current assignment")).toHaveTextContent("None yet");
  expect(readout("Current assignment")).toHaveAttribute("data-tone", "quiet");
  expect(readout("Light showing")).toHaveTextContent("Unlit");
  expect(readout("Light showing")).toHaveAttribute("data-tone", "quiet");

  await reachLesson(user, "east-applied");
  expect(readout("Current assignment")).toHaveTextContent("#2 · East");
  expect(readout("Light showing")).toHaveAttribute("data-tone", "plain");
  expect(readout("Light showing")).toHaveAttribute("data-signal", "blue");
  expect(readout("Light showing").querySelector("em")).toBeEmptyDOMElement();

  await reachLesson(user, "late-applied");
  expect(readout("Current assignment")).toHaveTextContent("#2 · East");
  expect(readout("Light showing")).toHaveAttribute("data-tone", "alert");
  expect(readout("Light showing")).toHaveAttribute("data-signal", "amber");
  expect(readout("Light showing").querySelector("em")).toHaveTextContent("Not assignment #2");
  expect(document.querySelectorAll(".race-readout")).toHaveLength(2);

  await reachLesson(user, "replay-west-set-aside");
  expect(readout("Light showing")).toHaveAttribute("data-tone", "plain");
  expect(readout("Earlier reports")).toHaveTextContent("#1 · Amber · West");
});

test("the lesson card names the chapter and puts the next action first", async () => {
  const user = userEvent.setup();
  render(<RaceConditionLab search={createControllableSearch().search} />);

  const progress = document.querySelector(".race-lesson-progress");
  expect(progress).toHaveTextContent("The lighthouse");
  expect(progress).toHaveTextContent("1 of 9");
  expect(document.querySelectorAll(".race-lesson-pips > span")).toHaveLength(9);
  expect(document.querySelectorAll(".race-lesson-pips > [data-done='true']")).toHaveLength(1);

  await user.click(screen.getByRole("button", { name: "Choose West" }));
  expect(progress).toHaveTextContent("2 of 9");
  expect(document.querySelectorAll(".race-lesson-pips > [data-done='true']")).toHaveLength(2);
  const actions = within(screen.getByRole("group", { name: "Lesson" })).getAllByRole("button");
  expect(actions.map((button) => button.textContent)).toEqual([
    "Send messenger #1",
    "Back",
    "Restart the lesson",
  ]);

  await reachLesson(user, "explain-check");
  expect(progress).toHaveTextContent("A better rule");
  expect(progress).toHaveTextContent("1 of 6");

  await reachLesson(user, "search-wait");
  expect(progress).toHaveTextContent("The search box");
  expect(progress).toHaveTextContent("1 of 16");
});

test("restart returns the lesson to the keeper", async () => {
  const user = userEvent.setup();
  render(<RaceConditionLab search={createControllableSearch().search} />);

  await user.click(screen.getByRole("button", { name: "Choose West" }));
  await user.click(screen.getByRole("button", { name: "Send messenger #1" }));
  await user.click(screen.getByRole("button", { name: "Restart the lesson" }));
  expect(lessonId()).toBe("meet-keeper");
  expect(document.querySelector("[data-messenger]")).toBeNull();
  expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
});

test("skipping the prediction still reaches the amber light", async () => {
  const user = userEvent.setup();
  render(<RaceConditionLab search={createControllableSearch().search} />);
  for (const name of [
    "Choose West",
    "Send messenger #1",
    "Change the assignment to East",
    "Send messenger #2",
    "Receive East's report",
    "Bring back messenger #1",
  ]) {
    await user.click(screen.getByRole("button", { name }));
  }
  expect(lessonId()).toBe("predict-late");
  await user.click(screen.getByRole("button", { name: "Show what happens" }));
  expect(lessonId()).toBe("late-applied");
  expect(document.querySelector(".harbour-lamp")).toHaveAttribute("data-signal", "amber");
  expect(screen.queryByText(/You chose/)).not.toBeInTheDocument();
});

test("arrow keys move the lesson only from the step controls", async () => {
  const user = userEvent.setup();
  render(<RaceConditionLab search={createControllableSearch().search} />);

  screen.getByRole("button", { name: "Choose West" }).focus();
  await user.keyboard("{ArrowRight}");
  expect(lessonId()).toBe("assign-west");

  screen.getByRole("button", { name: "Back" }).focus();
  await user.keyboard("{ArrowLeft}");
  expect(lessonId()).toBe("meet-keeper");

  for (const name of [
    "Choose West",
    "Send messenger #1",
    "Change the assignment to East",
    "Send messenger #2",
    "Receive East's report",
    "Bring back messenger #1",
  ]) {
    await user.click(screen.getByRole("button", { name }));
  }
  screen.getByRole("button", { name: "It stays blue" }).focus();
  await user.keyboard("{ArrowRight}");
  expect(lessonId()).toBe("predict-late");
});

async function openVariation(user: ReturnType<typeof userEvent.setup>, name: string) {
  const lessonSkip = screen.queryByRole("button", { name: "Skip to exploration" });
  const variationSkip = screen.queryByRole("button", { name: "Skip to search demo" });
  if (lessonSkip) {
    await user.click(lessonSkip);
  } else if (variationSkip) {
    await user.click(variationSkip);
  }
  await user.click(screen.getByRole("button", { name }));
  await user.click(screen.getByRole("button", { name: "Show this in the lighthouse" }));
}

test("each scenario starts its harbour variation where the outcome differs", async () => {
  const user = userEvent.setup();
  render(<RaceConditionLab search={createControllableSearch().search} />);

  await openVariation(user, "In order");
  expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
  expect(screen.getAllByText(/Imagine there is a lighthouse/).length).toBeGreaterThan(0);
  expect(document.querySelector("[data-messenger]")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Start the example" }));
  expect(screen.getAllByText(/messenger #1 has the shorter route/).length).toBeGreaterThan(0);
  expect(messenger(1)).toHaveAttribute("data-route", "short");
  expect(messenger(2)).toHaveAttribute("data-route", "long");
  expect(screen.getAllByText("Awaiting report").length).toBeGreaterThan(0);

  await openVariation(user, "Stale error");
  expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
  expect(document.querySelector("[data-messenger]")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Start the example" }));
  expect(screen.getAllByText("Blue · East").length).toBeGreaterThan(0);
  expect(messenger(1)).toHaveAttribute("data-progress", "en-route");
  expect(messenger(1)).toHaveAttribute("data-carrying", "none");

  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getAllByText(/What happens to the blue light/).length).toBeGreaterThan(0);
  expect(document.querySelector(".harbour-lamp")).toHaveAttribute("data-signal", "blue");
  await user.click(screen.getByRole("button", { name: "It goes dark" }));
  expect(document.querySelector(".harbour-lamp")).toHaveAttribute("data-signal", "blue");
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getAllByText(/You chose dark/).length).toBeGreaterThan(0);
  expect(screen.getAllByText("No signal").length).toBeGreaterThan(0);
  expect(screen.getByText("#2 · East channel")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getAllByText("Blue · East").length).toBeGreaterThan(0);
  expect(messenger(1)).toHaveAttribute("data-progress", "set-aside");
  expect(messenger(1)).toHaveAttribute("data-carrying", "slip");
  expect(screen.getAllByText(/ignores the slip/).length).toBeGreaterThan(0);

  await openVariation(user, "Same query");
  expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
  expect(screen.getAllByText("No assignment").length).toBeGreaterThan(0);
  await user.click(screen.getByRole("button", { name: "Start the example" }));
  expect(screen.getByText("#2 · West channel")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("from #1")).toBeInTheDocument();
  expect(messenger(1)).toHaveAttribute("data-progress", "delivered");
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("from #2")).toBeInTheDocument();
  expect(messenger(1)).toHaveAttribute("data-progress", "set-aside");
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
    await user.click(screen.getByRole("button", { name: "Choose West" }));
    await user.click(screen.getByRole("button", { name: "Send messenger #1" }));
    expect(document.querySelector(".harbour-layout")).toHaveAttribute("data-motion", "reduced");
    expect(messenger(1)).toHaveAttribute("data-progress", "en-route");
    expect(document.querySelector("[data-messenger='2']")).toBeNull();
    expect(lessonId()).toBe("messenger-1-away");
    expect(screen.getByText("Waiting for a report")).toBeInTheDocument();
  } finally {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: original });
  }
});

function requestChip(id: number): HTMLElement {
  const chips = [...document.querySelectorAll<HTMLElement>(".race-search-requests > li")];
  const found = chips.find((chip) => chip.querySelector("b")?.textContent === `#${id}`);
  if (!found) {
    throw new Error(`Missing request #${id}`);
  }
  return found;
}

test("the guided search keeps the lesson frame and ends on the checked answer", async () => {
  const user = userEvent.setup();
  render(<RaceConditionLab search={createControllableSearch().search} />);

  await reachLesson(user, "search-wait");
  expect(screen.queryByRole("searchbox", { name: "Search" })).not.toBeInTheDocument();
  expect(screen.getByText("The page asks another computer")).toBeInTheDocument();
  expect(readout("Text in the box")).toHaveTextContent("Empty");
  expect(readout("Results on screen")).toHaveTextContent("Nothing yet");
  expect(readout("Results on screen")).toHaveAttribute("data-tone", "quiet");
  expect(screen.queryByRole("separator", { name: "Sidebar width" })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Timeline" })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Explanation" })).not.toBeInTheDocument();

  await reachLesson(user, "naive-send-2");
  expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("rea");
  expect(screen.getByText("Apply every response")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: /Results for/ })).not.toBeInTheDocument();

  await reachLesson(user, "naive-deliver-1");
  expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("rea");
  expect(screen.getByRole("heading", { name: 'Results for "re"' })).toBeInTheDocument();

  expect(requestChip(1)).toHaveTextContent("re · Arrived");
  expect(readout("Text in the box")).toHaveTextContent('"rea"');
  expect(readout("Results on screen")).toHaveTextContent('For "re"');
  expect(readout("Results on screen")).toHaveAttribute("data-tone", "alert");
  expect(readout("Results on screen").querySelector("em")).toHaveTextContent("Not what the box says");

  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(lessonId()).toBe("naive-deliver-2");
  expect(screen.getByRole("heading", { name: 'Results for "rea"' })).toBeInTheDocument();
  expect(requestChip(1)).toHaveTextContent("re · On its way");
  expect(requestChip(2)).toHaveTextContent("rea · Arrived");
  expect(readout("Results on screen")).toHaveAttribute("data-tone", "plain");
  expect(readout("Results on screen").querySelector("em")).toBeEmptyDOMElement();

  await reachLesson(user, "protected-deliver-1");
  expect(screen.getByText("Check the request number")).toBeInTheDocument();
  expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("rea");
  expect(screen.getByRole("heading", { name: 'Results for "rea"' })).toBeInTheDocument();
  expect(document.querySelector(".race-lesson-search")).toHaveAttribute(
    "data-outcomes",
    "1:ignored 2:resolved",
  );
  expect(requestChip(1)).toHaveTextContent("re · Arrived, not displayed");
  expect(requestChip(2)).toHaveTextContent("rea · Arrived");
  expect(readout("Results on screen")).toHaveAttribute("data-tone", "plain");
  expect(applySchedule(scenarios.order, "protected").ignoredIds).toEqual([1]);

  await user.click(screen.getByRole("button", { name: "Explore the demo" }));
  expect(screen.getByRole("toolbar", { name: "Scenarios" })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Timeline" })).toBeInTheDocument();
});
