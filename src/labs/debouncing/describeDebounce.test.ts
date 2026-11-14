import { expect, test } from "vitest";
import { describeDebounce, type DebounceSnapshot } from "./describeDebounce.ts";

function snapshot(overrides: Partial<DebounceSnapshot> = {}): DebounceSnapshot {
  return {
    keystrokes: [],
    armed: false,
    pendingQuery: null,
    log: [],
    status: "idle",
    resultsQuery: "",
    ...overrides,
  };
}

test("describes an idle session", () => {
  expect(describeDebounce(snapshot())).toEqual({
    happened: "Nothing has been typed yet.",
    keystrokes: "No keystrokes yet.",
    window: "No debounce window is armed.",
    requests: "No searches have started.",
  });
});

test("describes an armed window before any search starts", () => {
  expect(
    describeDebounce(
      snapshot({
        keystrokes: [{ query: "re", at: 0 }],
        armed: true,
        pendingQuery: "re",
      }),
    ),
  ).toEqual({
    happened: 'A trailing window is armed for "re". No search has started.',
    keystrokes: '1 keystroke: "re" at 0 ms.',
    window: 'Armed for "re". The timer resets on each change and has not fired.',
    requests: "No searches have started.",
  });
});

test("describes a single applied search", () => {
  expect(
    describeDebounce(
      snapshot({
        keystrokes: [{ query: "react", at: 160 }],
        log: [
          { id: 1, query: "react", event: "started" },
          { id: 1, query: "react", event: "resolved" },
        ],
        status: "success",
        resultsQuery: "react",
      }),
    ),
  ).toEqual({
    happened: 'One search started for "react", and that response was applied.',
    keystrokes: '1 keystroke: "react" at 160 ms.',
    window: "No debounce window is armed.",
    requests: "1 search has started. 1 response was applied.",
  });
});

test("describes an ignored older response", () => {
  expect(
    describeDebounce(
      snapshot({
        keystrokes: [
          { query: "re", at: 0 },
          { query: "rea", at: 250 },
        ],
        log: [
          { id: 1, query: "re", event: "started" },
          { id: 2, query: "rea", event: "started" },
          { id: 1, query: "re", event: "ignored" },
          { id: 2, query: "rea", event: "resolved" },
        ],
        status: "success",
        resultsQuery: "rea",
      }),
    ),
  ).toEqual({
    happened: 'The older "re" response was ignored. Results stay on "rea".',
    keystrokes: '2 keystrokes: "re" at 0 ms, "rea" at 250 ms.',
    window: "No debounce window is armed.",
    requests: "2 searches have started. 1 response was applied. 1 older response was ignored.",
  });
});
