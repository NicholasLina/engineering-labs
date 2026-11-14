import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ExampleFrame,
  Explanation,
  LabSplit,
  PillList,
  ScenarioBar,
  SegmentedControl,
  TooltipButton,
} from "../../ui/index.ts";
import { createWallClock, type Clock } from "./clock.ts";
import { describeDebounce } from "./describeDebounce.ts";
import { createSimulatedSearch, type SearchFn } from "./simulateSearch.ts";
import {
  useDebouncedSearch,
  type Keystroke,
  type LogEntry,
  type PendingWindow,
  type SearchStatus,
  type SearchStrategy,
} from "./useDebouncedSearch.ts";
import "./debounce-lab.css";

type PresetStep = { at: number; query: string } | { at: number; clear: true };

type Preset = {
  label: string;
  tipId: string;
  tip: string;
  intervalMs: number;
  delayMs: number;
  steps: readonly PresetStep[];
};

const intervalTip =
  "Debounce interval for a typed query. Scenario buttons keep their own intervals.";
const delayTip = "Response delay for a typed query. Scenario buttons keep their own delays.";

const presets: readonly Preset[] = [
  {
    label: "Rapid burst",
    tipId: "debounce-tip-burst",
    tip: "Types r, re, rea, reac, and react at 0, 40, 80, 120, and 160 ms. Interval 300 ms, response delay 80 ms. Uses the selected strategy, not the Advanced interval or delay.",
    intervalMs: 300,
    delayMs: 80,
    steps: [
      { at: 0, query: "r" },
      { at: 40, query: "re" },
      { at: 80, query: "rea" },
      { at: 120, query: "reac" },
      { at: 160, query: "react" },
    ],
  },
  {
    label: "Pauses",
    tipId: "debounce-tip-pauses",
    tip: "Types re at 0 ms and rea at 700 ms. Interval 300 ms, response delay 80 ms. Each pause is long enough for its own search.",
    intervalMs: 300,
    delayMs: 80,
    steps: [
      { at: 0, query: "re" },
      { at: 700, query: "rea" },
    ],
  },
  {
    label: "Clear pending",
    tipId: "debounce-tip-clear-pending",
    tip: "Types re at 0 ms, then clears at 150 ms, inside a 300 ms window. The pending search does not start.",
    intervalMs: 300,
    delayMs: 80,
    steps: [
      { at: 0, query: "re" },
      { at: 150, clear: true },
    ],
  },
  {
    label: "Overlap",
    tipId: "debounce-tip-overlap",
    tip: "Types re at 0 ms and rea at 250 ms. Interval 200 ms, response delay 500 ms. The first response can arrive after the second search has started.",
    intervalMs: 200,
    delayMs: 500,
    steps: [
      { at: 0, query: "re" },
      { at: 250, query: "rea" },
    ],
  },
];

function requestLaneColor(id: number): string {
  const slot = ((id - 1) % 8 + 8) % 8 + 1;
  return `var(--lane-${slot})`;
}

function laneStyle(id: number): CSSProperties {
  return { "--lane": requestLaneColor(id) } as CSSProperties;
}

function formatMs(ms: number): string {
  return `${Math.round(ms)} ms`;
}

function statusText(session: {
  status: SearchStatus;
  query: string;
  resultsQuery: string;
  results: readonly unknown[];
  errorMessage: string | null;
  armed: boolean;
}): string {
  if (session.status === "loading") {
    return `Loading results for "${session.query}".`;
  }
  if (session.status === "success") {
    const noun = session.results.length === 1 ? "result" : "results";
    return `${session.results.length} ${noun} for "${session.resultsQuery}".`;
  }
  if (session.status === "empty") {
    return `No matches for "${session.resultsQuery}".`;
  }
  if (session.status === "error") {
    return session.errorMessage ?? "Search failed";
  }
  if (session.armed) {
    return `Waiting to search for "${session.query}".`;
  }
  return "Waiting for a query.";
}

function keystrokeText(stroke: Keystroke): string {
  return `${stroke.query} at ${formatMs(stroke.at)}`;
}

function windowText(pending: PendingWindow | null): string {
  if (pending === null) {
    return "No debounce window is armed.";
  }
  return `Armed for "${pending.query}". Fires at ${formatMs(pending.fireAt)}.`;
}

function logText(entry: LogEntry): string {
  return `#${entry.id} · ${entry.query} · ${entry.event} · ${formatMs(entry.at)}`;
}

export function DebounceLab({ clock, search }: { clock?: Clock; search?: SearchFn }) {
  const [fallbackClock] = useState(() => createWallClock());
  const activeClock = clock ?? fallbackClock;
  const [fallbackSearch] = useState(() => createSimulatedSearch(activeClock));
  const activeSearch = search ?? fallbackSearch;
  const [strategy, setStrategy] = useState<SearchStrategy>("immediate");
  const [intervalMs, setIntervalMs] = useState<"150" | "300" | "600">("300");
  const [delayMs, setDelayMs] = useState<"80" | "500">("80");
  const session = useDebouncedSearch({
    clock: activeClock,
    search: activeSearch,
    strategy,
  });
  const presetCancels = useRef<Array<() => void>>([]);

  useEffect(() => {
    const cancels = presetCancels;
    return () => {
      for (const cancel of cancels.current) {
        cancel();
      }
      cancels.current = [];
    };
  }, []);

  function cancelPresetTimers() {
    for (const cancel of presetCancels.current) {
      cancel();
    }
    presetCancels.current = [];
  }

  function runPreset(preset: Preset) {
    cancelPresetTimers();
    session.clear();
    // Scenarios carry their own interval and delay. They do not read Advanced.
    for (const step of preset.steps) {
      const cancel = activeClock.schedule(() => {
        if ("clear" in step) {
          session.clear();
          return;
        }
        session.changeQuery(step.query, {
          intervalMs: preset.intervalMs,
          delayMs: preset.delayMs,
        });
      }, step.at);
      presetCancels.current.push(cancel);
    }
  }

  function clearAll() {
    cancelPresetTimers();
    session.clear();
  }

  const description = describeDebounce({
    keystrokes: session.keystrokes,
    armed: session.armed,
    pendingQuery: session.pending?.query ?? null,
    log: session.log,
    status: session.status,
    resultsQuery: session.resultsQuery,
  });

  return (
    <LabSplit
      className="debounce-lab"
      labelledBy="debounce-lab-title"
      sidebar={
        <>
          <p className="back-link">
            <a href="#labs">Back to labs</a>
          </p>
          <h2 id="debounce-lab-title">Debouncing</h2>
          <p>
            Debouncing waits until a burst of events pauses, then runs the action
            once. Trailing edge means each change resets the timer. Nothing runs
            on the leading edge. The action runs once, after the latest change
            has been quiet for the whole interval.
          </p>
          <p>
            Search-as-you-type is that situation. Immediate mode starts a search
            on every non-empty change. Debounced mode waits for the pause and
            starts one search, using the query and the delay captured when the
            timer was armed. Fewer starts does not decide which response may
            render. A slow search can still finish after a newer one. Both
            strategies keep the same latest-id check. Clear and unmount advance
            an epoch, so a wiped run cannot write, and they cancel the timer so
            a pending pause cannot start work.
          </p>
          <section aria-label="Why this matters">
            <h3>Why this matters</h3>
            <p>
              A debounce interval only changes when work starts. Overlap becomes
              less common, and it is still possible. If every arrival writes the
              page, an older query&apos;s matches can land under a newer word.
              The screen still looks like a normal result list, and the failure
              shows up only when the older search is the slow one.
            </p>
          </section>
          <section aria-label="How to handle it">
            <h3>How to handle it</h3>
            <p>Reset the timer on each change so one search waits for a pause.</p>
            <pre className="ui-code">
              <code>{`let timer = 0;

function onType(query) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    search(query);
  }, interval);
}`}</code>
            </pre>
            <p>
              Keep a separate id for the latest search. A response may write only
              when its id is still that latest id. The timer decides when a
              search starts. The id check decides which response may render.
            </p>
            <pre className="ui-code">
              <code>{`function onSettled(id, items) {
  if (id !== latest) {
    return;
  }
  setResults(items);
}`}</code>
            </pre>
          </section>
          <section aria-label="Not in this example">
            <h3>Not in this example</h3>
            <ul className="ui-stack">
              <li>
                <strong>Real cancellation</strong>
                Aborting an in-flight search stops the work. This example lets
                every search finish. The id check is what keeps a late response
                off the page.
              </li>
              <li>
                <strong>Cache lifetime</strong>
                Remembering matches needs a size, an age, and a way to drop
                entries when the data changes. Nothing here is cached.
              </li>
              <li>
                <strong>In-flight duplicates</strong>
                Two identical queries could share one request. Sharing does not
                choose a winner when the queries differ.
              </li>
              <li>
                <strong>Retries</strong>
                A retry can deliver an older response after a newer one is
                already shown. That attempt needs the same write gate.
              </li>
            </ul>
          </section>
        </>
      }
    >
      <ScenarioBar
        labelId="debounce-scenarios-label"
        advancedPanelId="debounce-advanced-panel"
        advanced={
          <>
            <SegmentedControl<SearchStrategy>
              label="Strategy"
              labelId="debounce-strategy-label"
              value={strategy}
              onChange={setStrategy}
              options={[
                {
                  value: "immediate",
                  label: "Immediate",
                  tipId: "debounce-tip-immediate",
                  tip: "Starts a search on every non-empty change. The latest-id check still decides which response may write.",
                },
                {
                  value: "debounced",
                  label: "Debounced",
                  tipId: "debounce-tip-debounced",
                  tip: "Arms a trailing timer and starts one search after the pause. The same latest-id check decides which response may write.",
                },
              ]}
            />
            <SegmentedControl<"150" | "300" | "600">
              label="Interval"
              labelId="debounce-interval-label"
              value={intervalMs}
              onChange={setIntervalMs}
              options={[
                { value: "150", label: "150", tipId: "debounce-tip-interval-150", tip: intervalTip },
                { value: "300", label: "300", tipId: "debounce-tip-interval-300", tip: intervalTip },
                { value: "600", label: "600", tipId: "debounce-tip-interval-600", tip: intervalTip },
              ]}
            />
            <SegmentedControl<"80" | "500">
              label="Delay"
              labelId="debounce-delay-label"
              value={delayMs}
              onChange={setDelayMs}
              options={[
                { value: "80", label: "80", tipId: "debounce-tip-delay-80", tip: delayTip },
                { value: "500", label: "500", tipId: "debounce-tip-delay-500", tip: delayTip },
              ]}
            />
          </>
        }
      >
        {presets.map((preset) => (
          <TooltipButton
            key={preset.label}
            variant="primary"
            label={preset.label}
            tipId={preset.tipId}
            tip={preset.tip}
            onClick={() => {
              runPreset(preset);
            }}
          />
        ))}
        <TooltipButton
          variant="outline"
          label="Clear"
          tipId="debounce-tip-clear"
          tip="Clears the query, the keystrokes, and the request log, and cancels a pending timer. A response from this run cannot write."
          onClick={clearAll}
        />
      </ScenarioBar>

      <ExampleFrame label={<label htmlFor="debounce-query">Search</label>}>
        <div className="ui-field">
          <input
            id="debounce-query"
            type="search"
            value={session.query}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              session.changeQuery(event.target.value, {
                intervalMs: Number(intervalMs),
                delayMs: Number(delayMs),
              });
            }}
          />
        </div>
        <p className="ui-muted" role="status">
          {statusText(session)}
        </p>
        {session.status === "success" ? (
          <div className="ui-heading-row">
            <h3>{`Results for "${session.resultsQuery}"`}</h3>
            <PillList label="Matches" items={session.results} />
          </div>
        ) : null}
      </ExampleFrame>

      <Explanation
        titleId="debounce-explanation-title"
        happened={description.happened}
        readout={[
          { term: "Keystrokes", detail: description.keystrokes },
          { term: "Window", detail: description.window },
          { term: "Requests", detail: description.requests },
        ]}
      >
        <div className="debounce-record">
          <section aria-label="Keystrokes">
            <h3>Keystrokes</h3>
            {session.keystrokes.length === 0 ? (
              <p>No keystrokes yet.</p>
            ) : (
              <ol className="debounce-keystrokes">
                {session.keystrokes.map((stroke, index) => (
                  <li key={`${stroke.at}-${stroke.query}-${index}`}>{keystrokeText(stroke)}</li>
                ))}
              </ol>
            )}
          </section>
          <section aria-label="Window">
            <h3>Window</h3>
            <p className="debounce-window" data-armed={session.armed ? "true" : "false"}>
              {windowText(session.pending)}
            </p>
          </section>
          <section aria-label="Requests">
            <h3>Requests</h3>
            <p className="debounce-count">Start count: {session.startCount}</p>
            {session.log.length === 0 ? (
              <p>No requests yet.</p>
            ) : (
              <ol className="debounce-log">
                {session.log.map((entry, index) => (
                  <li
                    key={`${entry.id}-${entry.event}-${index}`}
                    data-event={entry.event}
                    style={laneStyle(entry.id)}
                  >
                    {logText(entry)}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </Explanation>
    </LabSplit>
  );
}
