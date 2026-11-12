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
      <div className="race-intro">
        <p>
          A race condition is a bug where the outcome depends on timing the
          program does not control. Overlapping operations can finish in a
          different order from the one they started in, and whichever finishes
          last can decide the result.
        </p>
        <p>
          Search-as-you-type is that situation. Each change starts a search
          without waiting for the previous one. Those searches overlap, and
          arrival order is up to latency. Applying every arrival can show
          another query&apos;s results, or another query&apos;s error, on a
          screen that still looks normal. The bug appears when the older
          request is the slower one.
        </p>
      </div>

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
        <div className="race-reading">
          <p>
            Each bar is one request. Its left edge is when the request was
            issued, and its length is the delay it was scheduled to wait. The
            out-of-order scenario issues &quot;re&quot; for 600 ms and
            &quot;rea&quot; for 50 ms from the same start. The short bar ends
            first, while the long bar is still running. That gap is the race.
          </p>
          <p>
            Naive mode writes every settlement, so the late &quot;re&quot;
            response replaces the &quot;rea&quot; results. Protected mode
            retires the older request when the newer search starts. The long
            bar still runs to its full length, and its outcome becomes ignored.
            Cancellation retires the request. The id check decides whether that
            late settlement may write.
          </p>
          <p>
            A repeated query is a cache hit: a marker with no duration. A hit
            is not an ordering policy. An older bar can still settle afterward
            and, in naive mode, replace it. Clear advances an epoch in either
            mode, and a response from that old epoch cannot write.
          </p>
        </div>
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
