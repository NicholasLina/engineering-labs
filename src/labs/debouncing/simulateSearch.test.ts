import { expect, test } from "vitest";
import { createManualClock } from "./clock.ts";
import { createSimulatedSearch, searchFailedMessage } from "./simulateSearch.ts";

test("resolves prefix matches after the delay on the injected clock", async () => {
  const clock = createManualClock();
  const search = createSimulatedSearch(clock);
  let settled = false;
  const pending = search({ query: "rea", delayMs: 80, fail: false }).then((items) => {
    settled = true;
    return items;
  });

  clock.advance(79);
  await Promise.resolve();
  expect(settled).toBe(false);

  clock.advance(1);
  await expect(pending).resolves.toEqual([{ id: "react", label: "react" }]);
});

test("rejects with Search failed when the request is marked to fail", async () => {
  const clock = createManualClock();
  const search = createSimulatedSearch(clock);
  const pending = search({ query: "re", delayMs: 10, fail: true });
  const assertion = expect(pending).rejects.toThrow(searchFailedMessage);

  clock.advance(10);
  await assertion;
});

test("an earlier search still settles after a later one", async () => {
  const clock = createManualClock();
  const search = createSimulatedSearch(clock);
  const first = search({ query: "re", delayMs: 500, fail: false });
  const second = search({ query: "rea", delayMs: 100, fail: false });

  clock.advance(100);
  await expect(second).resolves.toEqual([{ id: "react", label: "react" }]);

  let firstSettled = false;
  void first.then(() => {
    firstSettled = true;
  });
  await Promise.resolve();
  expect(firstSettled).toBe(false);

  clock.advance(400);
  await expect(first).resolves.toHaveLength(5);
});

test("an empty query resolves to no matches", async () => {
  const clock = createManualClock();
  const search = createSimulatedSearch(clock);
  const pending = search({ query: "   ", delayMs: 5, fail: false });

  clock.advance(5);
  await expect(pending).resolves.toEqual([]);
});
