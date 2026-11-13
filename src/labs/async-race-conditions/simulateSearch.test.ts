import { afterEach, expect, test, vi } from "vitest";
import { searchFailedMessage, createSimulatedSearch } from "./simulateSearch.ts";

afterEach(() => {
  vi.useRealTimers();
});

test("resolves prefix matches after the explicit delay", async () => {
  vi.useFakeTimers();
  const search = createSimulatedSearch();
  let settled = false;
  const pending = search({
    query: "rea",
    signal: new AbortController().signal,
    delayMs: 600,
    fail: false,
  }).then((items) => {
    settled = true;
    return items;
  });

  await vi.advanceTimersByTimeAsync(599);
  expect(settled).toBe(false);

  await vi.advanceTimersByTimeAsync(1);
  await expect(pending).resolves.toEqual([{ id: "react", label: "react" }]);
});

test("rejects with a stable error when the request is marked to fail", async () => {
  vi.useFakeTimers();
  const search = createSimulatedSearch();
  const pending = search({
    query: "re",
    signal: new AbortController().signal,
    delayMs: 10,
    fail: true,
  });
  const assertion = expect(pending).rejects.toThrow(searchFailedMessage);

  await vi.advanceTimersByTimeAsync(10);
  await assertion;
});

test("still finishes after the delay when the signal is already aborted", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  controller.abort();
  const search = createSimulatedSearch();
  const pending = search({
    query: "zzz",
    signal: controller.signal,
    delayMs: 50,
    fail: false,
  });

  await vi.advanceTimersByTimeAsync(50);
  await expect(pending).resolves.toEqual([]);
});
