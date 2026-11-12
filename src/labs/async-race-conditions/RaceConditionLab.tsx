import { useState } from "react";
import { createSimulatedSearch, type SearchFn } from "./simulateSearch.ts";
import { buildTimeline, type TimelineBar } from "./timeline.ts";
import {
  useSearchSession,
  type SearchMode,
  type SearchStatus,
} from "./useSearchSession.ts";
import "./race-condition-lab.css";

export const fastDelayMs = 50;
export const slowDelayMs = 600;

function statusText(session: {
  status: SearchStatus;
  query: string;
  resultsQuery: string;
  results: readonly unknown[];
  errorMessage: string | null;
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
  return "Waiting for a query.";
}

function timelineLabel(bar: TimelineBar): string {
  return `#${bar.id} ${bar.query}, ${bar.delayMs} ms, ${bar.outcome}`;
}

export function RaceConditionLab({ search }: { search?: SearchFn }) {
  const [mode, setMode] = useState<SearchMode>("naive");
  const [delayMs, setDelayMs] = useState(fastDelayMs);
  const [failNext, setFailNext] = useState(false);
  const [simulatedSearch] = useState(createSimulatedSearch);
  const session = useSearchSession({
    search: search ?? simulatedSearch,
    mode,
  });

  function runScenario(failSlow: boolean) {
    session.searchFor("re", { delayMs: slowDelayMs, fail: failSlow, useCache: false });
    session.searchFor("rea", { delayMs: fastDelayMs, fail: false, useCache: false });
  }

  function onQueryChange(value: string) {
    const fail = failNext;
    setFailNext(false);
    session.searchFor(value, { delayMs, fail });
  }

  return (
    <section className="race-lab" aria-labelledby="race-lab-title">
      <h2 id="race-lab-title">Race Condition</h2>
      <p className="race-intro">
        An older search can finish after a newer one and replace its results.
        Naive mode applies whichever response finishes last. Protected mode
        cancels the previous request and ignores that response if it still
        arrives.
      </p>

      <fieldset>
        <legend>Response handling</legend>
        <label className="race-choice">
          <input
            type="radio"
            name="race-mode"
            value="naive"
            checked={mode === "naive"}
            onChange={() => {
              setMode("naive");
            }}
          />
          Naive
        </label>
        <label className="race-choice">
          <input
            type="radio"
            name="race-mode"
            value="protected"
            checked={mode === "protected"}
            onChange={() => {
              setMode("protected");
            }}
          />
          Protected
        </label>
      </fieldset>

      <fieldset>
        <legend>Next response delay</legend>
        <label className="race-choice">
          <input
            type="radio"
            name="race-delay"
            value={fastDelayMs}
            checked={delayMs === fastDelayMs}
            onChange={() => {
              setDelayMs(fastDelayMs);
            }}
          />
          Fast
        </label>
        <label className="race-choice">
          <input
            type="radio"
            name="race-delay"
            value={slowDelayMs}
            checked={delayMs === slowDelayMs}
            onChange={() => {
              setDelayMs(slowDelayMs);
            }}
          />
          Slow
        </label>
      </fieldset>

      <label className="race-choice">
        <input
          type="checkbox"
          checked={failNext}
          onChange={(event) => {
            setFailNext(event.target.checked);
          }}
        />
        Fail the next request
      </label>

      <div className="race-query">
        <label htmlFor="race-query">Search</label>
        <input
          id="race-query"
          type="search"
          value={session.query}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            onQueryChange(event.target.value);
          }}
        />
      </div>

      <p className="race-hint">
        The scenario searches "re" slowly, then "rea" quickly.
      </p>
      <div className="race-actions">
        <button
          type="button"
          onClick={() => {
            runScenario(false);
          }}
        >
          Run out-of-order scenario
        </button>
        <button
          type="button"
          onClick={() => {
            runScenario(true);
          }}
        >
          Run stale-error scenario
        </button>
        <button
          type="button"
          onClick={() => {
            session.clear();
          }}
        >
          Clear
        </button>
      </div>

      <p className="race-status" role="status">
        {statusText(session)}
      </p>

      {session.status === "success" ? (
        <div>
          <h3>{`Results for "${session.resultsQuery}"`}</h3>
          <ul aria-label="Matches">
            {session.results.map((item) => (
              <li key={item.id}>{item.label}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section aria-label="Response timeline">
        <h3>Response timeline</h3>
        {session.requests.length === 0 ? (
          <p>No requests yet.</p>
        ) : (
          <ol className="race-timeline">
            {buildTimeline(session.requests).bars.map((bar) => (
              <li key={bar.id}>
                <span>{timelineLabel(bar)}</span>
                <div className="race-track" aria-hidden="true">
                  <span
                    className={bar.widthPct === 0 ? "race-marker" : "race-bar"}
                    data-outcome={bar.outcome}
                    style={
                      bar.widthPct === 0
                        ? { left: `${bar.startPct}%` }
                        : { left: `${bar.startPct}%`, width: `${bar.widthPct}%` }
                    }
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-label="Request log">
        <h3>Request log</h3>
        {session.log.length === 0 ? (
          <p>No requests yet.</p>
        ) : (
          <ol className="race-log">
            {session.log.map((entry, index) => (
              <li key={`${entry.id}-${entry.event}-${index}`}>
                #{entry.id} · {entry.query} · {entry.event}
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
