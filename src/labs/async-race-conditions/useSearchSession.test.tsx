import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import type { CatalogItem } from "./catalog.ts";
import type { SearchFn, SearchParams } from "./simulateSearch.ts";
import { useSearchSession, type SearchMode } from "./useSearchSession.ts";

type Deferred = {
  params: SearchParams;
  resolve: (items: CatalogItem[]) => void;
  reject: (error: unknown) => void;
};

function createControllableSearch() {
  const calls: Deferred[] = [];
  const search: SearchFn = (params) =>
    new Promise((resolve, reject) => {
      calls.push({ params, resolve, reject });
    });

  return { calls, search };
}

function renderSession(mode: SearchMode, search: SearchFn) {
  return renderHook(
    ({ currentMode }) => useSearchSession({ search, mode: currentMode }),
    { initialProps: { currentMode: mode } },
  );
}

const reactItem = { id: "react", label: "react" };
const reduxItem = { id: "redux", label: "redux" };

test("naive mode lets an older success overwrite a newer one", async () => {
  const { calls, search } = createControllableSearch();
  const { result } = renderSession("naive", search);

  act(() => {
    result.current.searchFor("re", { delayMs: 600, fail: false });
    result.current.searchFor("rea", { delayMs: 50, fail: false });
  });

  expect(calls[0]?.params.signal.aborted).toBe(false);
  expect(result.current.log.map((entry) => entry.event)).toEqual([
    "started",
    "started",
  ]);

  await act(async () => {
    calls[1]?.resolve([reactItem]);
  });
  expect(result.current.resultsQuery).toBe("rea");
  expect(result.current.results).toEqual([reactItem]);

  await act(async () => {
    calls[0]?.resolve([reactItem, reduxItem]);
  });
  expect(result.current.status).toBe("success");
  expect(result.current.query).toBe("rea");
  expect(result.current.resultsQuery).toBe("re");
  expect(result.current.results).toEqual([reactItem, reduxItem]);
  expect(result.current.log.map((entry) => `${entry.id}:${entry.event}`)).toEqual([
    "1:started",
    "2:started",
    "2:resolved",
    "1:resolved",
  ]);
});

test("protected mode keeps the newer success and records cancellation", async () => {
  const { calls, search } = createControllableSearch();
  const { result } = renderSession("protected", search);

  act(() => {
    result.current.searchFor("re", { delayMs: 600, fail: false });
    result.current.searchFor("rea", { delayMs: 50, fail: false });
  });

  expect(calls[0]?.params.signal.aborted).toBe(true);
  expect(calls[1]?.params.signal.aborted).toBe(false);

  await act(async () => {
    calls[0]?.resolve([reactItem, reduxItem]);
  });
  expect(result.current.status).toBe("loading");
  expect(result.current.results).toEqual([]);

  await act(async () => {
    calls[1]?.resolve([reactItem]);
  });
  expect(result.current.status).toBe("success");
  expect(result.current.resultsQuery).toBe("rea");
  expect(result.current.results).toEqual([reactItem]);
  expect(result.current.log.map((entry) => `${entry.id}:${entry.event}`)).toEqual([
    "1:started",
    "1:cancel-requested",
    "2:started",
    "1:ignored",
    "2:resolved",
  ]);
});

test("switching to protected mode ignores an unaborted stale response", async () => {
  const { calls, search } = createControllableSearch();
  const { result, rerender } = renderSession("naive", search);

  act(() => {
    result.current.searchFor("re", { delayMs: 600, fail: false });
    result.current.searchFor("rea", { delayMs: 50, fail: false });
  });
  expect(calls[0]?.params.signal.aborted).toBe(false);

  rerender({ currentMode: "protected" });
  await act(async () => {
    calls[1]?.resolve([reactItem]);
    calls[0]?.resolve([reduxItem]);
  });

  expect(calls[0]?.params.signal.aborted).toBe(false);
  expect(result.current.resultsQuery).toBe("rea");
  expect(result.current.results).toEqual([reactItem]);
  expect(result.current.log.some((entry) => entry.id === 1 && entry.event === "ignored")).toBe(
    true,
  );
});

test("a stale failure does not replace the current success in protected mode", async () => {
  const { calls, search } = createControllableSearch();
  const { result } = renderSession("protected", search);

  act(() => {
    result.current.searchFor("re", { delayMs: 600, fail: true });
    result.current.searchFor("rea", { delayMs: 50, fail: false });
  });
  await act(async () => {
    calls[1]?.resolve([reactItem]);
  });
  await act(async () => {
    calls[0]?.reject(new Error("Search failed"));
  });

  expect(result.current.status).toBe("success");
  expect(result.current.results).toEqual([reactItem]);
  expect(result.current.errorMessage).toBeNull();
  expect(result.current.log.some((entry) => entry.id === 1 && entry.event === "ignored")).toBe(
    true,
  );
});

test("a stale failure replaces the current success in naive mode", async () => {
  const { calls, search } = createControllableSearch();
  const { result } = renderSession("naive", search);

  act(() => {
    result.current.searchFor("re", { delayMs: 600, fail: true });
    result.current.searchFor("rea", { delayMs: 50, fail: false });
  });
  await act(async () => {
    calls[1]?.resolve([reactItem]);
    calls[0]?.reject(new Error("Search failed"));
  });

  expect(result.current.status).toBe("error");
  expect(result.current.query).toBe("rea");
  expect(result.current.results).toEqual([]);
  expect(result.current.errorMessage).toBe("Search failed");
  expect(result.current.resultsQuery).toBe("");
});

test("the latest failure is shown and is not cached", async () => {
  const { calls, search } = createControllableSearch();
  const { result } = renderSession("protected", search);

  act(() => {
    result.current.searchFor("re", { delayMs: 10, fail: true });
  });
  await act(async () => {
    calls[0]?.reject(new Error("Search failed"));
  });

  expect(result.current.status).toBe("error");
  expect(result.current.results).toEqual([]);
  expect(result.current.query).toBe("re");

  act(() => {
    result.current.searchFor("re", { delayMs: 10, fail: false });
  });
  expect(calls).toHaveLength(2);
  expect(result.current.status).toBe("loading");
});

test("an empty success is cached for an exact repeat", async () => {
  const { calls, search } = createControllableSearch();
  const { result } = renderSession("protected", search);

  act(() => {
    result.current.searchFor("zzz", { delayMs: 10, fail: false });
  });
  await act(async () => {
    calls[0]?.resolve([]);
  });
  expect(result.current.status).toBe("empty");
  expect(result.current.resultsQuery).toBe("zzz");

  act(() => {
    result.current.searchFor(" ZZZ ", { delayMs: 10, fail: false });
  });
  expect(calls).toHaveLength(1);
  expect(result.current.status).toBe("empty");
  expect(result.current.log.at(-1)?.event).toBe("cache-hit");
});

test("clearing ignores a late response and leaves the session idle", async () => {
  const { calls, search } = createControllableSearch();
  const { result } = renderSession("naive", search);

  act(() => {
    result.current.searchFor("re", { delayMs: 600, fail: false });
  });
  act(() => {
    result.current.clear();
  });

  expect(calls[0]?.params.signal.aborted).toBe(true);
  expect(result.current.status).toBe("idle");
  expect(result.current.query).toBe("");
  expect(result.current.results).toEqual([]);

  await act(async () => {
    calls[0]?.resolve([reactItem, reduxItem]);
  });
  expect(result.current.status).toBe("idle");
  expect(result.current.results).toEqual([]);
  expect(result.current.log.some((entry) => entry.event === "ignored")).toBe(true);

  act(() => {
    result.current.searchFor("re", { delayMs: 10, fail: false });
  });
  expect(calls).toHaveLength(2);
});

test("a blank query clears the session", () => {
  const { calls, search } = createControllableSearch();
  const { result } = renderSession("protected", search);

  act(() => {
    result.current.searchFor("re", { delayMs: 10, fail: false });
    result.current.searchFor("   ", { delayMs: 10, fail: false });
  });

  expect(calls[0]?.params.signal.aborted).toBe(true);
  expect(result.current.status).toBe("idle");
  expect(result.current.query).toBe("");
});

test("unmount aborts the current signal and a later resolve does not throw", async () => {
  const { calls, search } = createControllableSearch();
  const { result, unmount } = renderSession("protected", search);

  act(() => {
    result.current.searchFor("rea", { delayMs: 50, fail: false });
  });
  unmount();

  expect(calls[0]?.params.signal.aborted).toBe(true);
  await act(async () => {
    calls[0]?.resolve([reactItem]);
  });
});

test("a repeated query reuses the cached success without searching again", async () => {
  const { calls, search } = createControllableSearch();
  const { result } = renderSession("naive", search);

  act(() => {
    result.current.searchFor("rea", { delayMs: 50, fail: false });
  });
  await act(async () => {
    calls[0]?.resolve([reactItem]);
  });
  act(() => {
    result.current.searchFor("rea", { delayMs: 50, fail: false });
  });

  expect(calls).toHaveLength(1);
  expect(result.current.results).toEqual([reactItem]);
  expect(result.current.log.at(-1)).toMatchObject({ id: 2, query: "rea", event: "cache-hit" });
});

test("a stale success stays cached for a later query", async () => {
  const { calls, search } = createControllableSearch();
  const { result } = renderSession("protected", search);

  act(() => {
    result.current.searchFor("re", { delayMs: 600, fail: false });
    result.current.searchFor("rea", { delayMs: 50, fail: false });
  });
  await act(async () => {
    calls[0]?.resolve([reactItem, reduxItem]);
  });
  expect(result.current.status).toBe("loading");

  act(() => {
    result.current.searchFor("re", { delayMs: 600, fail: false });
  });
  expect(calls).toHaveLength(2);
  expect(result.current.status).toBe("success");
  expect(result.current.resultsQuery).toBe("re");
  expect(result.current.results).toEqual([reactItem, reduxItem]);
  expect(result.current.log.at(-1)?.event).toBe("cache-hit");
});

test("naive mode lets an older response overwrite a cache hit", async () => {
  const { calls, search } = createControllableSearch();
  const { result } = renderSession("naive", search);

  act(() => {
    result.current.searchFor("rea", { delayMs: 10, fail: false });
  });
  await act(async () => {
    calls[0]?.resolve([reactItem]);
  });
  act(() => {
    result.current.searchFor("re", { delayMs: 600, fail: false });
    result.current.searchFor("rea", { delayMs: 0, fail: false });
  });

  expect(calls).toHaveLength(2);
  expect(calls[1]?.params.signal.aborted).toBe(false);
  expect(result.current.resultsQuery).toBe("rea");

  await act(async () => {
    calls[1]?.resolve([reactItem, reduxItem]);
  });
  expect(result.current.resultsQuery).toBe("re");
  expect(result.current.results).toEqual([reactItem, reduxItem]);
});

test("the log keeps the latest 50 entries", () => {
  const { search } = createControllableSearch();
  const { result } = renderSession("naive", search);

  act(() => {
    for (let index = 0; index < 51; index += 1) {
      result.current.searchFor(`q${index}`, { delayMs: 10, fail: false });
    }
  });

  expect(result.current.log).toHaveLength(50);
  expect(result.current.log[0]?.id).toBe(2);
  expect(result.current.log.at(-1)?.id).toBe(51);
  expect(result.current.requests).toHaveLength(50);
  expect(result.current.requests[0]?.id).toBe(2);
  expect(result.current.requests.at(-1)?.id).toBe(51);
  expect(result.current.requests.at(-1)?.delayMs).toBe(10);
  expect(result.current.requests.at(-1)?.outcome).toBe("pending");
});
