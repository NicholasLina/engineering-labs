import { useState, type CSSProperties } from "react";
import {
  ExampleFrame,
  Explanation,
  LabSplit,
  ScenarioBar,
  SegmentedControl,
  SwitchControl,
  TooltipButton,
} from "../../ui/index.ts";
import { backoffCapMs } from "./backoff.ts";
import { createWallClock, type Clock } from "./clock.ts";
import { describeRetries } from "./describeRetries.ts";
import {
  useRetryLoad,
  type AttemptOutcome,
  type RetryMode,
  type RetryState,
} from "./useRetryLoad.ts";
import "./retry-lab.css";

type ScriptChoice = "success" | "then-success" | "transient" | "permanent";

const backoffSample = `let current = 0;
let timer = 0;

function load(query) {
  const id = ++current;
  clearTimeout(timer);
  let attempt = 0;

  const run = () => {
    if (id !== current) {
      return;
    }
    attempt += 1;
    const outcome = read(query);
    if (id !== current) {
      return;
    }
    if (outcome === "success") {
      show("Loaded " + query);
      return;
    }
    if (outcome === "permanent" || attempt >= 3) {
      show(outcome === "permanent" ? "Permanent failure." : "Transient failure.");
      return;
    }
    const wait = Math.min(800, 200 * 2 ** (attempt - 1));
    timer = setTimeout(run, wait);
  };

  run();
}`;

function scriptFor(choice: ScriptChoice): readonly AttemptOutcome[] {
  if (choice === "success") {
    return ["success"];
  }
  if (choice === "then-success") {
    return ["transient", "success"];
  }
  if (choice === "transient") {
    return ["transient", "transient", "transient"];
  }
  return ["permanent"];
}

function statusText(state: RetryState): string {
  if (state.status === "success" && state.result) {
    return state.result;
  }
  if (state.status === "failed" && state.error) {
    return state.error;
  }
  if (state.status === "waiting" && state.waitMs !== null) {
    return `Waiting ${state.waitMs} ms to retry ${state.query}.`;
  }
  return "No load has started yet.";
}

function laneColor(logicalId: number): string {
  const slot = ((logicalId - 1) % 8 + 8) % 8 + 1;
  return `var(--lane-${slot})`;
}

function laneStyle(logicalId: number): CSSProperties {
  return { "--lane": laneColor(logicalId) } as CSSProperties;
}

function waitWidth(waitMs: number): string {
  return `${Math.min(100, (waitMs / backoffCapMs) * 100)}%`;
}

export function RetryLab({ clock }: { clock?: Clock }) {
  const [mode, setMode] = useState<RetryMode>("none");
  const [jitter, setJitter] = useState(false);
  const [scriptChoice, setScriptChoice] = useState<ScriptChoice>("success");
  const [draft, setDraft] = useState("");
  const [wallClock] = useState<Clock>(() => createWallClock());
  const session = useRetryLoad(clock ?? wallClock);
  const described = describeRetries(session);
  const preset = { mode, jitter: false as const };

  function loadDraft() {
    const query = draft.trim();
    if (query.length === 0) {
      return;
    }
    setDraft(query);
    session.start(query, scriptFor(scriptChoice), { mode, jitter });
  }

  function runRecover() {
    setDraft("alpha");
    session.start("alpha", ["transient", "success"], preset);
  }

  function runAttemptLimit() {
    setDraft("alpha");
    session.start("alpha", ["transient", "transient", "transient"], preset);
  }

  function runPermanent() {
    setDraft("alpha");
    session.start("alpha", ["permanent"], preset);
  }

  function runSupersede() {
    setDraft("beta");
    session.start("alpha", ["transient", "success"], preset);
    session.start("beta", ["success"], preset);
  }

  function runClearWaiting() {
    setDraft("");
    session.start("alpha", ["transient", "success"], preset);
    session.clear();
  }

  function runClear() {
    setDraft("");
    session.clear();
  }

  const waiting = session.status === "waiting" && session.waitMs !== null;

  return (
    <LabSplit
      className="retry-lab"
      labelledBy="retry-lab-title"
      sidebar={
        <>
          <p className="back-link">
            <a href="#labs">Back to labs</a>
          </p>
          <h2 id="retry-lab-title">Retries</h2>
          <div className="retry-intro">
            <p>
              A retry is another attempt after a read fails. It can recover a
              failure that may not last. It stays safe only while three limits
              still hold: how many attempts have already started, how long the
              backoff says to wait, and whether this is still the logical
              request on screen.
            </p>
            <p>
              A scripted read shows that schedule directly. Each attempt is
              success, transient, or permanent, and the result is applied when
              the attempt starts. The wait you see is the backoff before a
              retry. A permanent result stops on that attempt, including when
              bounded backoff is selected. A transient result stops in No retry
              mode. Bounded backoff schedules another attempt until 3 attempts
              have started.
            </p>
          </div>
          <section aria-label="Why this matters">
            <h3>Why this matters</h3>
            <p>
              A transient failure can succeed on a later try. Past the attempt
              limit, more tries keep the screen busy after the failure has
              settled. A retry for an old query can also start, or write, after
              a newer query, a clear, or a departure. The limit here is 3 total
              attempts, including the first try. With jitter off, the wait is
              200 ms before the second attempt and 400 ms before the third.
              Seeded jitter, when it is on, replaces each of those waits with an
              integer from 0 through one less than the full delay. Every logical
              request starts that sequence from seed 1.
            </p>
          </section>
          <section aria-label="How to handle it">
            <h3>How to handle it</h3>
            <p>
              Cap the attempts, wait on that schedule, and keep the id of the
              logical request. Check the id when the timer fires, before the
              next attempt starts. Check it again before writing the outcome.
              Clear and unmount cancel the timer and move the id forward, so a
              callback that still runs has nothing current to write. The sample
              is the jitter-off schedule. The manual Load button can turn on
              seeded full jitter. Scenarios leave jitter off.
            </p>
            <pre className="ui-code">
              <code>{backoffSample}</code>
            </pre>
          </section>
          <section aria-label="Not in this example">
            <h3>Not in this example</h3>
            <ul className="retry-related ui-stack">
              <li>
                <strong>Retrying writes</strong>
                <p>
                  A repeated write can apply twice. Writes also need
                  idempotency, so a repeat is the same operation.
                </p>
              </li>
              <li>
                <strong>Debouncing</strong>
                <p>
                  A typing pause chooses when the first attempt starts. This
                  example starts when Load or a scenario is clicked.
                </p>
              </li>
              <li>
                <strong>Cache lifetime</strong>
                <p>
                  A stored response needs a size, an age, and a way to drop it
                  when the underlying data changes.
                </p>
              </li>
              <li>
                <strong>In-flight duplicates</strong>
                <p>
                  Identical callers can share one read. Each Load here has its
                  own logical request and its own attempt budget.
                </p>
              </li>
            </ul>
          </section>
        </>
      }
    >
      <ScenarioBar
        labelId="retry-scenarios-label"
        advancedPanelId="retry-advanced-panel"
        advanced={
          <>
            <SegmentedControl<RetryMode>
              label="Mode"
              labelId="retry-mode-label"
              value={mode}
              onChange={setMode}
              options={[
                {
                  value: "none",
                  label: "No retry",
                  tipId: "retry-tip-none",
                  tip: "A transient failure stops on that attempt. No further attempt is scheduled.",
                },
                {
                  value: "backoff",
                  label: "Bounded backoff",
                  tipId: "retry-tip-backoff",
                  tip: "A transient failure waits 200 ms, then 400 ms, and stops after 3 total attempts. A permanent failure stops on that attempt.",
                },
              ]}
            />
            <div className="ui-tool">
              <span className="ui-tool-label" id="retry-jitter-label">
                Jitter
              </span>
              <SwitchControl
                label="Jitter"
                checked={jitter}
                tipId="retry-tip-jitter"
                tip="When on, the manual Load button draws each wait with mulberry32 seed 1. The wait is an integer below the full delay. Scenarios leave jitter off."
                onChange={setJitter}
              />
            </div>
            <SegmentedControl<ScriptChoice>
              label="Script"
              labelId="retry-script-label"
              value={scriptChoice}
              onChange={setScriptChoice}
              options={[
                {
                  value: "success",
                  label: "Success",
                  tipId: "retry-tip-script-success",
                  tip: "The manual Load button succeeds on the first attempt.",
                },
                {
                  value: "then-success",
                  label: "Transient then success",
                  tipId: "retry-tip-script-then",
                  tip: "The manual Load button is transient, then succeeds. Scenarios do not use this control.",
                },
                {
                  value: "transient",
                  label: "Always transient",
                  tipId: "retry-tip-script-transient",
                  tip: "The manual Load button is transient on every attempt.",
                },
                {
                  value: "permanent",
                  label: "Permanent",
                  tipId: "retry-tip-script-permanent",
                  tip: "The manual Load button fails permanently on the first attempt.",
                },
              ]}
            />
          </>
        }
      >
        <TooltipButton
          variant="primary"
          label="Recover"
          tipId="retry-tip-recover"
          tip='Loads "alpha". The first attempt is transient and the second succeeds. Uses the selected mode. Jitter stays off.'
          onClick={runRecover}
        />
        <TooltipButton
          variant="primary"
          label="Attempt limit"
          tipId="retry-tip-limit"
          tip='Loads "alpha". Every attempt is transient, so bounded backoff stops after 3 total attempts.'
          onClick={runAttemptLimit}
        />
        <TooltipButton
          variant="primary"
          label="Permanent"
          tipId="retry-tip-permanent"
          tip='Loads "alpha". A permanent failure stops on the first attempt in either mode.'
          onClick={runPermanent}
        />
        <TooltipButton
          variant="primary"
          label="Supersede"
          tipId="retry-tip-supersede"
          tip='Starts "alpha", then starts "beta" in the same click, before any timer. The alpha retry must not write.'
          onClick={runSupersede}
        />
        <TooltipButton
          variant="primary"
          label="Clear waiting"
          tipId="retry-tip-clear-waiting"
          tip='Starts "alpha", then clears in the same click. A timer from that start must not add an attempt.'
          onClick={runClearWaiting}
        />
        <TooltipButton
          variant="outline"
          label="Clear"
          tipId="retry-tip-clear"
          tip="Cancels the armed timer and returns to idle with an empty attempt list."
          onClick={runClear}
        />
      </ScenarioBar>

      <ExampleFrame label="Load">
        <div className="retry-load">
          <div className="ui-field retry-query">
            <label htmlFor="retry-query">Query</label>
            <input
              id="retry-query"
              type="search"
              value={draft}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setDraft(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  loadDraft();
                }
              }}
            />
          </div>
          <TooltipButton
            variant="primary"
            label="Load"
            tipId="retry-tip-load"
            tip="Loads the query in the box with the script selected under Advanced, and with the current mode and jitter."
            onClick={loadDraft}
          />
        </div>
        <p className="retry-logical">Logical request {session.logicalId ?? "none"}</p>
        <p className="ui-muted" role="status">
          {statusText(session)}
        </p>
      </ExampleFrame>

      <Explanation
        titleId="retry-explanation-title"
        happened={described.happened}
        readout={[
          { term: "Request", detail: described.request },
          { term: "Attempts", detail: described.attempts },
          { term: "Wait", detail: described.wait },
          { term: "Outcome", detail: described.outcome },
        ]}
      >
        <div className="retry-record">
          <section aria-label="Attempts">
            <h3>Attempts</h3>
            {session.attempts.length === 0 ? (
              <p className="retry-empty">No attempts yet.</p>
            ) : (
              <ol className="retry-attempts">
                {session.attempts.map((attempt) => (
                  <li
                    key={`${attempt.logicalId}-${attempt.attempt}`}
                    data-outcome={attempt.outcome}
                    style={laneStyle(attempt.logicalId)}
                  >
                    {`Attempt ${attempt.attempt}, ${attempt.outcome}, ${attempt.query}`}
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section className="retry-wait" aria-label="Waiting">
            <h3>Waiting</h3>
            <p>
              {waiting
                ? `${session.waitMs} ms before the next attempt`
                : "No retry is waiting."}
            </p>
            <div
              className="retry-wait-track"
              aria-hidden="true"
              style={session.logicalId === null ? undefined : laneStyle(session.logicalId)}
            >
              <span
                className="retry-wait-bar"
                style={{ width: waiting ? waitWidth(session.waitMs ?? 0) : "0%" }}
              />
            </div>
          </section>
        </div>
      </Explanation>
    </LabSplit>
  );
}
