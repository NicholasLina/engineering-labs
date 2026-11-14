import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import type { CatalogItem } from "./catalog.ts";
import { createManualClock } from "./clock.ts";
import { createSimulatedSearch, type SearchFn, type SearchParams } from "./simulateSearch.ts";
import { useDebouncedSearch, type SearchStrategy } from "./useDebouncedSearch.ts";

const reactItem = { id: "react", label: "react" };
const broadMatch = [
  reactItem,
  { id: "redux", label: "redux" },
  { id: "relay", label: "relay" },
  { id: "rest", label: "rest" },
  { id: "rendering", label: "rendering" },
];

const burst = [
  ["r", 0],
  ["re", 40],
  ["rea", 80],
  ["reac", 120],
  ["react", 160],
] as const;

type Deferred = {
  params: SearchParams;
  resolve: (items: CatalogItem[]) => void;
  reject: (error: unknown) => void;
};

function createDeferredSearch() {
  const calls: Deferred[] = [];
  const search: SearchFn = (params) =>
    new Promise((resolve, reject) => {
      calls.push({ params, resolve, reject });
    });
  return { calls, search };
}

function renderSession(strategy: SearchStrategy, search?: SearchFn) {
  const clock = createManualClock();
  const resolved = search ?? createSimulatedSearch(clock);
  const rendered = renderHook(
    ({ current }: { current: SearchStrategy }) =>
      useDebouncedSearch({ clock, search: resolved, strategy: current }),
    { initialProps: { current: strategy } },
  );
  return { clock, search: resolved, ...rendered };
}

test("a debounced burst starts one search for react", async () => {
  const { clock, result } = renderSession("debounced");

  act(() => {
    for (const [query, at] of burst) {
      clock.advance(at - clock.now());
      result.current.changeQuery(query, { intervalMs: 300, delayMs: 80 });
    }
  });

  expect(result.current.startCount).toBe(0);
  expect(result.current.armed).toBe(true);
  expect(result.current.pending).toEqual({ query: "react", fireAt: 460 });
  expect(result.current.keystrokes.map((stroke) => stroke.query)).toEqual([
    "r",
    "re",
    "rea",
    "reac",
    "react",
  ]);

  act(() => {
    clock.advance(460 - clock.now());
  });
  expect(result.current.startCount).toBe(1);
  expect(result.current.log.filter((entry) => entry.event === "started")).toEqual([
    expect.objectContaining({ id: 1, query: "react", at: 460 }),
  ]);
  expect(result.current.status).toBe("loading");
  expect(result.current.armed).toBe(false);

  act(() => {
    clock.advance(79);
  });
  expect(result.current.status).toBe("loading");
  act(() => {
    clock.advance(1);
  });
  expect(result.current.status).toBe("success");
  expect(result.current.resultsQuery).toBe("react");
  expect(result.current.results).toEqual([reactItem]);
});

test("an immediate burst starts five searches", () => {
  const { clock, result } = renderSession("immediate");

  act(() => {
    for (const [query, at] of burst) {
      clock.advance(at - clock.now());
      result.current.changeQuery(query, { intervalMs: 300, delayMs: 80 });
    }
  });

  expect(result.current.startCount).toBe(5);
  expect(result.current.log.filter((entry) => entry.event === "started").map((entry) => entry.query)).toEqual([
    "r",
    "re",
    "rea",
    "reac",
    "react",
  ]);
  expect(result.current.armed).toBe(false);

  act(() => {
    clock.advance(240 - clock.now());
  });
  expect(result.current.resultsQuery).toBe("react");
  expect(result.current.results).toEqual([reactItem]);
  expect(result.current.log.filter((entry) => entry.event === "ignored").map((entry) => entry.query)).toEqual([
    "r",
    "re",
    "rea",
    "reac",
  ]);
});

test("pauses start re and then rea", () => {
  const { clock, result } = renderSession("debounced");

  act(() => {
    result.current.changeQuery("re", { intervalMs: 300, delayMs: 80 });
  });
  act(() => {
    clock.advance(300);
  });
  expect(result.current.startCount).toBe(1);
  expect(result.current.log.filter((entry) => entry.event === "started")).toEqual([
    expect.objectContaining({ query: "re", at: 300 }),
  ]);

  act(() => {
    clock.advance(80);
  });
  expect(result.current.resultsQuery).toBe("re");
  expect(result.current.results).toEqual(broadMatch);

  act(() => {
    clock.advance(320);
    result.current.changeQuery("rea", { intervalMs: 300, delayMs: 80 });
  });
  expect(clock.now()).toBe(700);
  expect(result.current.startCount).toBe(1);
  expect(result.current.armed).toBe(true);

  act(() => {
    clock.advance(300);
  });
  expect(result.current.startCount).toBe(2);
  expect(result.current.log.filter((entry) => entry.event === "started").map((entry) => entry.query)).toEqual([
    "re",
    "rea",
  ]);
  expect(result.current.log.filter((entry) => entry.event === "started").map((entry) => entry.at)).toEqual([
    300,
    1000,
  ]);

  act(() => {
    clock.advance(80);
  });
  expect(result.current.resultsQuery).toBe("rea");
  expect(result.current.results).toEqual([reactItem]);
  expect(result.current.log.some((entry) => entry.event === "ignored")).toBe(false);
});

test("clear during the debounce window starts nothing", () => {
  const { clock, result } = renderSession("debounced");

  act(() => {
    result.current.changeQuery("re", { intervalMs: 300, delayMs: 80 });
  });
  act(() => {
    clock.advance(150);
    result.current.clear();
  });

  expect(clock.now()).toBe(150);
  expect(result.current.startCount).toBe(0);
  expect(result.current.armed).toBe(false);
  expect(result.current.pending).toBeNull();
  expect(result.current.log).toEqual([]);
  expect(result.current.keystrokes).toEqual([]);
  expect(result.current.status).toBe("idle");

  act(() => {
    clock.advance(200);
  });
  expect(clock.now()).toBe(350);
  expect(result.current.startCount).toBe(0);
  expect(result.current.log).toEqual([]);
  expect(result.current.status).toBe("idle");
});

test("debounced overlap ignores the older response and keeps rea", () => {
  const { clock, result } = renderSession("debounced");

  act(() => {
    result.current.changeQuery("re", { intervalMs: 200, delayMs: 500 });
  });
  act(() => {
    clock.advance(250);
    result.current.changeQuery("rea", { intervalMs: 200, delayMs: 500 });
  });

  expect(result.current.log.filter((entry) => entry.event === "started")).toEqual([
    expect.objectContaining({ query: "re", at: 200 }),
  ]);

  act(() => {
    clock.advance(200);
  });
  expect(clock.now()).toBe(450);
  expect(result.current.log.filter((entry) => entry.event === "started").map((entry) => entry.at)).toEqual([
    200,
    450,
  ]);

  act(() => {
    clock.advance(250);
  });
  expect(clock.now()).toBe(700);
  expect(result.current.status).toBe("loading");
  expect(result.current.results).toEqual([]);
  expect(result.current.log.some((entry) => entry.id === 1 && entry.event === "ignored")).toBe(true);

  act(() => {
    clock.advance(250);
  });
  expect(result.current.status).toBe("success");
  expect(result.current.resultsQuery).toBe("rea");
  expect(result.current.results).toEqual([reactItem]);
  expect(result.current.log.some((entry) => entry.id === 1 && entry.event === "resolved")).toBe(false);
});

test("immediate overlap also ignores the older response", () => {
  const { clock, result } = renderSession("immediate");

  act(() => {
    result.current.changeQuery("re", { intervalMs: 200, delayMs: 500 });
  });
  act(() => {
    clock.advance(250);
    result.current.changeQuery("rea", { intervalMs: 200, delayMs: 500 });
  });

  expect(result.current.log.filter((entry) => entry.event === "started").map((entry) => ({
    query: entry.query,
    at: entry.at,
  }))).toEqual([
    { query: "re", at: 0 },
    { query: "rea", at: 250 },
  ]);

  act(() => {
    clock.advance(250);
  });
  expect(clock.now()).toBe(500);
  expect(result.current.status).toBe("loading");
  expect(result.current.results).toEqual([]);
  expect(result.current.log.some((entry) => entry.id === 1 && entry.event === "ignored")).toBe(true);

  act(() => {
    clock.advance(250);
  });
  expect(result.current.status).toBe("success");
  expect(result.current.resultsQuery).toBe("rea");
  expect(result.current.results).toEqual([reactItem]);
});

test("unmount drops a scheduled fire and a late resolve", () => {
  const clock = createManualClock();
  let calls = 0;
  const search: SearchFn = (params) => {
    calls += 1;
    return createSimulatedSearch(clock)(params);
  };
  const { result, unmount } = renderHook(() =>
    useDebouncedSearch({ clock, search, strategy: "debounced" }),
  );

  act(() => {
    result.current.changeQuery("re", { intervalMs: 100, delayMs: 100 });
    clock.advance(100);
    result.current.changeQuery("rea", { intervalMs: 300, delayMs: 50 });
  });
  expect(calls).toBe(1);
  expect(result.current.armed).toBe(true);

  unmount();
  expect(() => {
    act(() => {
      clock.advance(500);
    });
  }).not.toThrow();
  expect(calls).toBe(1);
});

test("an empty query clears the session and does not arm a timer", () => {
  const { clock, result } = renderSession("debounced");

  act(() => {
    result.current.changeQuery("re", { intervalMs: 300, delayMs: 80 });
    result.current.changeQuery("   ", { intervalMs: 300, delayMs: 80 });
  });

  expect(result.current.query).toBe("");
  expect(result.current.armed).toBe(false);
  expect(result.current.pending).toBeNull();
  expect(result.current.keystrokes).toEqual([]);
  expect(result.current.status).toBe("idle");

  act(() => {
    clock.advance(300);
  });
  expect(result.current.startCount).toBe(0);
});

test("clear drops a late response without a log row", async () => {
  const { calls, search } = createDeferredSearch();
  const { result } = renderSession("immediate", search);

  act(() => {
    result.current.changeQuery("re", { intervalMs: 10, delayMs: 10 });
  });
  act(() => {
    result.current.clear();
  });
  await act(async () => {
    calls[0]?.resolve(broadMatch);
  });

  expect(result.current.status).toBe("idle");
  expect(result.current.results).toEqual([]);
  expect(result.current.log).toEqual([]);
  expect(result.current.query).toBe("");
});

test("a stale failure is ignored and a current failure is shown", async () => {
  const { calls, search } = createDeferredSearch();
  const { result } = renderSession("immediate", search);

  act(() => {
    result.current.changeQuery("re", { intervalMs: 10, delayMs: 500 });
    result.current.changeQuery("rea", { intervalMs: 10, delayMs: 500 });
  });
  await act(async () => {
    calls[1]?.resolve([reactItem]);
  });
  await act(async () => {
    calls[0]?.reject(new Error("Search failed"));
  });

  expect(result.current.status).toBe("success");
  expect(result.current.resultsQuery).toBe("rea");
  expect(result.current.errorMessage).toBeNull();
  expect(result.current.log.some((entry) => entry.id === 1 && entry.event === "ignored")).toBe(true);

  act(() => {
    result.current.changeQuery("nope", { intervalMs: 10, delayMs: 10 });
  });
  await act(async () => {
    calls[2]?.reject(new Error("Search failed"));
  });
  expect(result.current.status).toBe("error");
  expect(result.current.results).toEqual([]);
  expect(result.current.errorMessage).toBe("Search failed");
  expect(result.current.log.at(-1)?.event).toBe("rejected");
});

test("a repeated query searches again", async () => {
  const { calls, search } = createDeferredSearch();
  const { result } = renderSession("immediate", search);

  act(() => {
    result.current.changeQuery("rea", { intervalMs: 10, delayMs: 10 });
  });
  await act(async () => {
    calls[0]?.resolve([reactItem]);
  });
  act(() => {
    result.current.changeQuery("rea", { intervalMs: 10, delayMs: 10 });
  });

  expect(calls).toHaveLength(2);
  expect(calls[1]?.params).toEqual({ query: "rea", delayMs: 10, fail: false });
  expect(result.current.status).toBe("loading");
});

test("an empty success is shown and is not cached", () => {
  const { clock, result } = renderSession("immediate");

  act(() => {
    result.current.changeQuery("zzz", { intervalMs: 10, delayMs: 20 });
  });
  act(() => {
    clock.advance(20);
  });

  expect(result.current.status).toBe("empty");
  expect(result.current.resultsQuery).toBe("zzz");
  expect(result.current.results).toEqual([]);

  act(() => {
    result.current.changeQuery("zzz", { intervalMs: 10, delayMs: 20 });
  });
  expect(result.current.startCount).toBe(2);
  expect(result.current.status).toBe("loading");
});

test("the log and keystrokes keep the latest 50 entries", () => {
  const { result } = renderSession("immediate");

  act(() => {
    for (let index = 0; index < 51; index += 1) {
      result.current.changeQuery(`q${index}`, { intervalMs: 10, delayMs: 10 });
    }
  });

  expect(result.current.keystrokes).toHaveLength(50);
  expect(result.current.keystrokes[0]?.query).toBe("q1");
  expect(result.current.keystrokes.at(-1)?.query).toBe("q50");
  expect(result.current.log).toHaveLength(50);
  expect(result.current.log[0]?.id).toBe(2);
  expect(result.current.log.at(-1)?.id).toBe(51);
  expect(result.current.startCount).toBe(51);
});
