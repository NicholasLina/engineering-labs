import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { RaceConditionLab, fastDelayMs, slowDelayMs } from "./RaceConditionLab.tsx";
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

  await user.click(screen.getByRole("button", { name: "Run out-of-order scenario" }));

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
  const log = screen.getByRole("region", { name: "Request log" });
  expect(within(log).getByText("#2 · rea · resolved")).toBeInTheDocument();
  expect(within(log).getByText("#1 · re · resolved")).toBeInTheDocument();
});

test("protected mode keeps the newer scenario results", async () => {
  const user = userEvent.setup();
  const { calls, search } = createControllableSearch();
  render(<RaceConditionLab search={search} />);

  await user.click(screen.getByRole("radio", { name: "Protected" }));
  await user.click(screen.getByRole("button", { name: "Run out-of-order scenario" }));
  await act(async () => {
    calls[1]?.resolve([reactItem]);
  });
  await act(async () => {
    calls[0]?.resolve(broadMatch);
  });

  expect(screen.getByRole("heading", { name: 'Results for "rea"' })).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent('1 result for "rea".');
  const log = screen.getByRole("region", { name: "Request log" });
  expect(within(log).getByText("#1 · re · cancel-requested")).toBeInTheDocument();
  expect(within(log).getByText("#1 · re · ignored")).toBeInTheDocument();
});

test("the stale-error scenario does not replace protected results", async () => {
  const user = userEvent.setup();
  const { calls, search } = createControllableSearch();
  render(<RaceConditionLab search={search} />);

  await user.click(screen.getByRole("radio", { name: "Protected" }));
  await user.click(screen.getByRole("button", { name: "Run stale-error scenario" }));
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

  await user.click(screen.getByRole("checkbox", { name: "Fail the next request" }));
  await user.type(screen.getByRole("searchbox", { name: "Search" }), "z");
  expect(calls[0]?.params.fail).toBe(true);
  expect(screen.getByRole("checkbox", { name: "Fail the next request" })).not.toBeChecked();

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

  await act(async () => {
    calls[0]?.resolve(broadMatch);
  });
  expect(input).toHaveValue("");
  expect(screen.getByRole("status")).toHaveTextContent("Waiting for a query.");
  expect(screen.queryByRole("heading", { name: /Results for/ })).not.toBeInTheDocument();
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
});

test("the scenario searches again when those queries are already cached", async () => {
  const user = userEvent.setup();
  const { calls, search } = createControllableSearch();
  render(<RaceConditionLab search={search} />);

  await user.click(screen.getByRole("button", { name: "Run out-of-order scenario" }));
  await act(async () => {
    calls[0]?.resolve(broadMatch);
    calls[1]?.resolve([reactItem]);
  });
  await user.click(screen.getByRole("button", { name: "Run out-of-order scenario" }));

  expect(calls).toHaveLength(4);
  expect(calls[2]?.params.query).toBe("re");
  expect(calls[3]?.params.query).toBe("rea");
});
