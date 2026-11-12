import { useState, type CSSProperties } from "react";
import {
  ExampleFrame,
  Explanation,
  LabSplit,
  PillList,
  ScenarioBar,
  SegmentedControl,
  SwitchControl,
  TooltipButton,
} from "../../ui/index.ts";
import { describeInspector, type InspectorKind } from "./inspectorCopy.ts";
import { createSimulatedSearch, type SearchFn } from "./simulateSearch.ts";
import { buildTimeline, requestLaneColor, type TimelineBar } from "./timeline.ts";
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

function laneStyle(id: number, geometry: CSSProperties): CSSProperties {
  return { ...geometry, "--lane": requestLaneColor(id) } as CSSProperties;
}

function timelineLabel(bar: TimelineBar): string {
  return `#${bar.id} ${bar.query}, ${bar.delayMs} ms, ${bar.outcome}`;
}

function labelPlace(bar: TimelineBar): "inside" | "beside" | "start" {
  if (bar.startPct > 50) {
    return "start";
  }
  if (bar.widthPct < 28) {
    return "beside";
  }
  return "inside";
}

function labelStyle(bar: TimelineBar, place: "inside" | "beside" | "start"): CSSProperties {
  if (place === "start") {
    return { left: "0.45rem" };
  }
  if (place === "beside") {
    const gap = bar.widthPct === 0 ? "0.7rem" : "0.45rem";
    return { left: `calc(${bar.startPct + bar.widthPct}% + ${gap})` };
  }
  return { left: `calc(${bar.startPct}% + 0.45rem)` };
}

const delayTip =
  "This delay applies to a typed or pasted query. The scenario buttons always use 600 ms, then 50 ms.";

export function RaceConditionLab({ search }: { search?: SearchFn }) {
  const [mode, setMode] = useState<SearchMode>("naive");
  const [delayMs, setDelayMs] = useState(fastDelayMs);
  const [failNext, setFailNext] = useState(false);
  const [kind, setKind] = useState<InspectorKind>("idle");
  const [simulatedSearch] = useState(createSimulatedSearch);
  const session = useSearchSession({
    search: search ?? simulatedSearch,
    mode,
  });

  function runScenario(next: "order" | "sequence" | "error" | "duplicate") {
    setKind(next);
    if (next === "sequence") {
      session.searchFor("re", { delayMs: fastDelayMs, fail: false, useCache: false });
      session.searchFor("rea", { delayMs: slowDelayMs, fail: false, useCache: false });
      return;
    }
    if (next === "duplicate") {
      session.searchFor("re", { delayMs: slowDelayMs, fail: false, useCache: false });
      session.searchFor("re", { delayMs: fastDelayMs, fail: false, useCache: false });
      return;
    }
    session.searchFor("re", { delayMs: slowDelayMs, fail: next === "error", useCache: false });
    session.searchFor("rea", { delayMs: fastDelayMs, fail: false, useCache: false });
  }

  function onQueryChange(value: string) {
    const fail = failNext;
    setKind("manual");
    setFailNext(false);
    session.searchFor(value, { delayMs, fail });
  }

  const inspector = describeInspector({
    kind,
    mode,
    query: session.query,
    status: session.status,
    resultsQuery: session.resultsQuery,
    requests: session.requests,
  });

  return (
    <LabSplit
      className="race-lab"
      labelledBy="race-lab-title"
      sidebar={
      <>
        <p className="back-link">
          <a href="#labs">Back to labs</a>
        </p>
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
        <section aria-label="Why this matters">
          <h3>Why this matters</h3>
          <p>
            The failure is intermittent, because latency varies. The screen still
            looks like a normal result list. What it shows can be another
            query&apos;s data, or another query&apos;s error.
          </p>
        </section>
        <section aria-label="How to handle it">
          <h3>How to handle it</h3>
          <p>Applying every settlement lets the response that finishes last decide the screen.</p>
          <pre className="ui-code">
            <code>{`function onSuccess(items: Item[]) {
  setResults(items);
}`}</code>
          </pre>
          <p>
            Abort the previous request when a newer one starts. That retires the
            work. Still ignore a settlement whose id is no longer the latest.
            The id check decides the write. Clear and unmount need a separate
            generation check, because that response can still be the latest id
            from a screen that is gone.
          </p>
          <pre className="ui-code">
            <code>{`let latest = 0;
let controller = new AbortController();

function search(query: string) {
  const id = ++latest;
  controller.abort();
  controller = new AbortController();

  void load(query, controller.signal).then((items) => {
    if (id !== latest) {
      return;
    }
    setResults(items);
  });
}`}</code>
          </pre>
        </section>
        <section aria-label="Not in this example">
          <h3>Not in this example</h3>
          <ul className="race-related ui-stack">
            <li>
              <strong>Debouncing</strong>
              <p>
                Waiting for a typing pause reduces how often requests overlap. It
                does not choose which response may write.
              </p>
            </li>
            <li>
              <strong>Real cancellation</strong>
              <p>
                A production fetch usually rejects when it is aborted. This
                simulator finishes its delay so the late response stays visible.
              </p>
            </li>
            <li>
              <strong>Cache lifetime</strong>
              <p>
                A useful cache also needs a size limit, an age, and a way to drop
                entries when the underlying data changes.
              </p>
            </li>
            <li>
              <strong>In-flight duplicates</strong>
              <p>
                Two identical queries can share one request. That does not decide
                what happens when a different query is still in flight.
              </p>
            </li>
            <li>
              <strong>Retries</strong>
              <p>
                Retrying a failed request can deliver an older response after a
                newer one has already been shown.
              </p>
            </li>
          </ul>
        </section>
      </>
      }
    >
      <ScenarioBar
        labelId="race-scenarios-label"
        advancedPanelId="race-advanced-panel"
        advanced={
          <>
            <SegmentedControl<SearchMode>
              label="Handling"
              labelId="race-handling-label"
              value={mode}
              onChange={setMode}
              options={[
                {
                  value: "naive",
                  label: "Naive",
                  tipId: "race-tip-naive",
                  tip: "Every settlement writes the screen, including an older response that finishes last.",
                },
                {
                  value: "protected",
                  label: "Protected",
                  tipId: "race-tip-protected",
                  tip: "A newer search retires the previous request. A late settlement is ignored.",
                },
              ]}
            />
            <SegmentedControl<"fast" | "slow">
              label="Delay"
              labelId="race-delay-label"
              value={delayMs === slowDelayMs ? "slow" : "fast"}
              onChange={(value) => {
                setDelayMs(value === "slow" ? slowDelayMs : fastDelayMs);
              }}
              options={[
                { value: "fast", label: "Fast", tipId: "race-tip-fast", tip: delayTip },
                { value: "slow", label: "Slow", tipId: "race-tip-slow", tip: delayTip },
              ]}
            />
            <div className="ui-tool">
              <span className="ui-tool-label" id="race-fail-label">
                Failure
              </span>
              <SwitchControl
                label="Fail next"
                checked={failNext}
                tipId="race-tip-fail"
                tip="Applies to the next manual search only, then clears itself. It does not change the scenario buttons."
                onChange={setFailNext}
              />
            </div>
          </>
        }
      >
        <TooltipButton
          variant="primary"
          label="Out of order"
          tipId="race-tip-order"
          tip='Searches "re" for 600 ms, then "rea" for 50 ms, even when those queries are cached.'
          onClick={() => {
            runScenario("order");
          }}
        />
        <TooltipButton
          variant="primary"
          label="In order"
          tipId="race-tip-sequence"
          tip='Searches "re" for 50 ms, then "rea" for 600 ms. The newer request is the slow one, so the last response matches the box.'
          onClick={() => {
            runScenario("sequence");
          }}
        />
        <TooltipButton
          variant="primary"
          label="Stale error"
          tipId="race-tip-error"
          tip='Same timing as Out of order, but the slow "re" request fails.'
          onClick={() => {
            runScenario("error");
          }}
        />
        <TooltipButton
          variant="primary"
          label="Same query"
          tipId="race-tip-duplicate"
          tip='Searches "re" for 600 ms, then "re" again for 50 ms, even when that query is cached. Both answers match.'
          onClick={() => {
            runScenario("duplicate");
          }}
        />
        <TooltipButton
          variant="outline"
          label="Clear"
          tipId="race-tip-clear"
          tip="Advances the epoch and clears the timeline and request list. A response from the old epoch cannot write."
          onClick={() => {
            setKind("cleared");
            session.clear();
          }}
        />
      </ScenarioBar>

      <ExampleFrame label={<label htmlFor="race-query">Search</label>}>
        <div className="ui-field">
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
        titleId="race-explanation-title"
        happened={inspector.happened}
        readout={[
          { term: "Search", detail: inspector.search },
          { term: "Timeline", detail: inspector.timeline },
          { term: "Requests", detail: inspector.requests },
        ]}
      >
        <div className="race-record">
      <section aria-label="Timeline">
        <h3>Timeline</h3>
        {session.requests.length === 0 ? (
          <p>No requests yet.</p>
        ) : (
          <ol className="race-timeline">
            {buildTimeline(session.requests).bars.map((bar) => {
              const place = labelPlace(bar);
              return (
                <li key={bar.id}>
                  <div
                    className="race-lane"
                    data-outcome={bar.outcome}
                    style={laneStyle(bar.id, {})}
                  >
                    <span
                      className={bar.widthPct === 0 ? "race-marker" : "race-bar"}
                      data-outcome={bar.outcome}
                      title={timelineLabel(bar)}
                      style={
                        bar.widthPct === 0
                          ? { left: `${bar.startPct}%` }
                          : { left: `${bar.startPct}%`, width: `${bar.widthPct}%` }
                      }
                    />
                    <span
                      className="race-bar-name"
                      data-place={place}
                      style={labelStyle(bar, place)}
                    >
                      {timelineLabel(bar)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section aria-label="Requests">
        <h3>Requests</h3>
        {session.log.length === 0 ? (
          <p>No requests yet.</p>
        ) : (
          <ol className="race-log ui-stack">
            {session.log.map((entry, index) => (
              <li
                key={`${entry.id}-${entry.event}-${index}`}
                data-event={entry.event}
                style={laneStyle(entry.id, {})}
              >
                #{entry.id} · {entry.query} · {entry.event}
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
