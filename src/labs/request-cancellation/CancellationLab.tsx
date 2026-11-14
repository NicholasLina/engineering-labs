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
import { createWallClock, type Clock } from "./clock.ts";
import { describeCancellation } from "./describeCancellation.ts";
import {
  createAbortableSearch,
  manualSearchDelayMs,
  type SearchFn,
} from "./simulateSearch.ts";
import {
  useCancellationSession,
  type CancellationMode,
  type LogEntry,
  type RequestRecord,
  type SearchStatus,
} from "./useCancellationSession.ts";
import "./cancellation-lab.css";

const replaceSlowMs = 600;
const replaceFastMs = 80;

const handlingSample = `let latest = 0;
let epoch = 0;
let controller = new AbortController();

function search(query) {
  const id = ++latest;
  const generation = epoch;
  controller.abort();
  controller = new AbortController();

  load(query, controller.signal).then(
    (items) => {
      if (generation !== epoch || id !== latest) return;
      setResults(items);
    },
    (error) => {
      if (generation !== epoch || id !== latest) return;
      if (isAbortError(error)) return;
      setError(error);
    },
  );
}`;

function requestLaneColor(id: number): string {
  const slot = ((id - 1) % 8 + 8) % 8 + 1;
  return `var(--lane-${slot})`;
}

function laneStyle(id: number): CSSProperties {
  return { "--lane": requestLaneColor(id) } as CSSProperties;
}

function runOrigin(requests: readonly RequestRecord[]): number {
  if (requests.length === 0) {
    return 0;
  }
  return Math.min(...requests.map((request) => request.startedAt));
}

function formatOffset(at: number, origin: number): string {
  return `t+${Math.round(at - origin)} ms`;
}

function actualShare(request: RequestRecord): number {
  if (request.endedAt === null) {
    return 0;
  }
  if (request.plannedMs <= 0) {
    return 1;
  }
  const actual = request.endedAt - request.startedAt;
  return Math.max(0, Math.min(1, actual / request.plannedMs));
}

function outcomeText(request: RequestRecord): string {
  if (request.outcome === "pending") {
    return "pending";
  }
  if (request.outcome === "aborted") {
    return "aborted";
  }
  if (request.write === "ignored") {
    return `${request.outcome}, ignored`;
  }
  return request.outcome;
}

function requestText(request: RequestRecord, origin: number): string {
  const end =
    request.endedAt === null ? "running" : formatOffset(request.endedAt, origin);
  const lifetime =
    request.endedAt === null
      ? "lifetime running"
      : `lifetime ${Math.round(request.endedAt - request.startedAt)} ms`;
  return `#${request.id} ${request.query} · ${formatOffset(request.startedAt, origin)} → ${end} · planned ${request.plannedMs} ms · ${lifetime} · ${outcomeText(request)}`;
}

function logText(entry: LogEntry, origin: number): string {
  return `${formatOffset(entry.at, origin)} · #${entry.id} · ${entry.query} · ${entry.event}`;
}

function statusText(session: {
  status: SearchStatus;
  query: string;
  resultsQuery: string;
  results: readonly unknown[];
  errorMessage: string | null;
}): string {
  const simulation = "The transport is a simulation.";
  if (session.status === "loading") {
    return `Loading results for "${session.query}". ${simulation}`;
  }
  if (session.status === "success") {
    const noun = session.results.length === 1 ? "result" : "results";
    return `${session.results.length} ${noun} for "${session.resultsQuery}". ${simulation}`;
  }
  if (session.status === "empty") {
    return `No matches for "${session.resultsQuery}". ${simulation}`;
  }
  if (session.status === "error") {
    return `${session.errorMessage ?? "Search failed"}. ${simulation}`;
  }
  if (session.query.length > 0) {
    return `No request is loading for "${session.query}". ${simulation}`;
  }
  return `Waiting for a query. ${simulation}`;
}

export function CancellationLab({
  clock,
  search,
}: {
  clock?: Clock;
  search?: SearchFn;
}) {
  const [mode, setMode] = useState<CancellationMode>("ignore");
  const [failNext, setFailNext] = useState(false);
  const [clockImpl] = useState(() => clock ?? createWallClock());
  const [transport] = useState(() => search ?? createAbortableSearch(clockImpl));
  const session = useCancellationSession({
    clock: clockImpl,
    search: transport,
    mode,
  });
  const copy = describeCancellation({
    mode,
    status: session.status,
    query: session.query,
    resultsQuery: session.resultsQuery,
    requests: session.requests,
    log: session.log,
  });
  const origin = runOrigin(session.requests);

  function replace() {
    session.search("re", { delayMs: replaceSlowMs, fail: false });
    session.search("rea", { delayMs: replaceFastMs, fail: false });
  }

  function cancelEarly() {
    session.search("re", { delayMs: replaceSlowMs, fail: false });
    session.cancel();
  }

  function cancelLate() {
    session.search("re", { delayMs: 0, fail: false });
    clockImpl.schedule(() => {
      session.cancel();
    }, 0);
  }

  function clearPending() {
    session.search("re", { delayMs: replaceSlowMs, fail: false });
    session.clear();
  }

  function onQueryChange(value: string) {
    const fail = failNext;
    setFailNext(false);
    session.search(value, { delayMs: manualSearchDelayMs, fail });
  }

  return (
    <LabSplit
      className="cancel-lab"
      labelledBy="cancel-lab-title"
      sidebar={
        <>
          <p className="back-link">
            <a href="#labs">Back to labs</a>
          </p>
          <h2 id="cancel-lab-title">Request Cancellation</h2>
          <div className="cancel-intro">
            <p>
              Cancellation is two separate jobs. Stopping obsolete work ends the
              wait. Refusing an obsolete write keeps a late response off the
              screen. Abort does the first. An id check does the second. Either
              one can happen without the other.
            </p>
            <p>
              Search-as-you-type is that situation. Each change starts a search
              while an older one can still be running. This page is a
              simulation. Aborting this simulated timer does not undo server
              work. Lab 1&apos;s simulator finishes its delay on purpose, so the
              late response can still arrive. This simulation clears the timer
              and rejects.
            </p>
          </div>
          <section aria-label="Why this matters">
            <h3>Why this matters</h3>
            <p>
              A cancelled request is not a failed search. Treating the abort as
              an error shows Search failed for a query the visitor stopped.
              Letting the slow response land anyway shows another query&apos;s
              rows. The lifetime is the clock time from start to settlement.
              Abort can make that shorter than the planned delay. Ignore mode
              still runs the full delay, then drops the write.
            </p>
          </section>
          <section aria-label="How to handle it">
            <h3>How to handle it</h3>
            <p>
              Abort the previous signal when a newer search starts, and still
              ignore a settlement whose id is no longer the latest. Clear and
              unmount advance an epoch, because that response can still carry
              the highest id from a screen that is gone.
            </p>
            <pre className="ui-code">
              <code>{handlingSample}</code>
            </pre>
          </section>
          <section aria-label="Not in this example">
            <h3>Not in this example</h3>
            <ul className="cancel-related ui-stack">
              <li>
                <strong>Debouncing</strong>
                <p>
                  Waiting for a typing pause reduces how often requests overlap.
                  It does not choose which response may write.
                </p>
              </li>
              <li>
                <strong>Cache lifetime</strong>
                <p>
                  A useful cache also needs a size limit, an age, and a way to
                  drop entries when the underlying data changes.
                </p>
              </li>
              <li>
                <strong>In-flight duplicates</strong>
                <p>
                  Two identical queries can share one request. That does not
                  decide what happens when a different query is still in flight.
                </p>
              </li>
              <li>
                <strong>Retries</strong>
                <p>
                  Retrying a failed request can deliver an older response after
                  a newer one has already been shown.
                </p>
              </li>
              <li>
                <strong>Server-side effects</strong>
                <p>
                  Aborting this simulated timer does not undo server work. A
                  real request may already have changed data before the client
                  hears about the abort.
                </p>
              </li>
            </ul>
          </section>
        </>
      }
    >
      <ScenarioBar
        labelId="cancel-scenarios-label"
        advancedPanelId="cancel-advanced-panel"
        advanced={
          <>
            <SegmentedControl<CancellationMode>
              label="Mode"
              labelId="cancel-mode-label"
              value={mode}
              onChange={setMode}
              options={[
                {
                  value: "ignore",
                  label: "Ignore",
                  tipId: "cancel-tip-ignore",
                  tip: "A newer query does not abort the previous signal. The late completion still happens, and the write gate drops it.",
                },
                {
                  value: "abort",
                  label: "Abort and guard",
                  tipId: "cancel-tip-abort",
                  tip: "A newer query aborts the previous signal and clears its timer. The write gate still ignores a result that arrives anyway.",
                },
              ]}
            />
            <div className="ui-tool">
              <span className="ui-tool-label" id="cancel-fail-label">
                Failure
              </span>
              <SwitchControl
                label="Fail next"
                checked={failNext}
                tipId="cancel-tip-fail"
                tip="Applies to the next manual search only, then clears itself. It does not change the scenario buttons."
                onChange={setFailNext}
              />
            </div>
          </>
        }
      >
        <TooltipButton
          variant="primary"
          label="Replace"
          tipId="cancel-tip-replace"
          tip='Searches "re" for 600 ms, then "rea" for 80 ms, using the selected mode.'
          onClick={replace}
        />
        <TooltipButton
          variant="primary"
          label="Cancel early"
          tipId="cancel-tip-early"
          tip='Searches "re" for 600 ms, then cancels before that timer fires.'
          onClick={cancelEarly}
        />
        <TooltipButton
          variant="primary"
          label="Cancel late"
          tipId="cancel-tip-late"
          tip='Searches "re" for 0 ms, then schedules cancel at 0 ms after that timer so the work finishes first.'
          onClick={cancelLate}
        />
        <TooltipButton
          variant="outline"
          label="Clear pending"
          tipId="cancel-tip-clear"
          tip='Searches "re" for 600 ms, then clears. The epoch advances. Ignore mode does not abort the timer.'
          onClick={clearPending}
        />
      </ScenarioBar>

      <ExampleFrame label={<label htmlFor="cancel-query">Search</label>}>
        <div className="cancel-query">
          <div className="ui-field">
            <input
              id="cancel-query"
              type="search"
              value={session.query}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                onQueryChange(event.target.value);
              }}
            />
          </div>
          <button
            type="button"
            className="ui-button"
            onClick={() => {
              session.cancel();
            }}
          >
            Cancel
          </button>
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
        titleId="cancel-explanation-title"
        happened={copy.happened}
        readout={[
          { term: "Search", detail: copy.search },
          { term: "Lifetime", detail: copy.lifetime },
          { term: "Log", detail: copy.log },
        ]}
      >
        <div className="cancel-record">
          <section aria-label="Requests">
            <h3>Requests</h3>
            {session.requests.length === 0 ? (
              <p>No requests yet.</p>
            ) : (
              <ol className="cancel-requests">
                {session.requests.map((request) => (
                  <li key={request.id} data-outcome={request.outcome} style={laneStyle(request.id)}>
                    <p>{requestText(request, origin)}</p>
                    <div
                      className="cancel-life"
                      data-running={request.outcome === "pending" ? "true" : "false"}
                      style={{ "--actual": actualShare(request) } as CSSProperties}
                    >
                      <span />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section aria-label="Log">
            <h3>Log</h3>
            {session.log.length === 0 ? (
              <p>No events yet.</p>
            ) : (
              <ol className="cancel-log">
                {session.log.map((entry, index) => (
                  <li
                    key={`${entry.id}-${entry.event}-${index}`}
                    data-event={entry.event}
                    style={laneStyle(entry.id)}
                  >
                    {logText(entry, origin)}
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
