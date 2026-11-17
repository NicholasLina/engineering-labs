import { useRef, useState, type CSSProperties } from "react";
import {
  Disclosure,
  ExampleFrame,
  Explanation,
  LabSplit,
  PillList,
  ScenarioBar,
  SegmentedControl,
  SwitchControl,
  TooltipButton,
} from "../../ui/index.ts";
import { describeBridge } from "./bridgeCopy.ts";
import { HarbourScene } from "./HarbourScene.tsx";
import {
  acknowledgementFor,
  frameFor,
  harbourStory,
  lighthouseRules,
  lighthouseSceneCopy,
  raceConditionCopy,
} from "./harbour.ts";
import { LessonShell } from "./LessonShell.tsx";
import { describeInspector, type InspectorKind } from "./inspectorCopy.ts";
import { fastDelayMs, scenarios, slowDelayMs, type ScenarioId } from "./scenarios.ts";
import { createSimulatedSearch, type SearchFn } from "./simulateSearch.ts";
import { buildTimeline, requestLaneColor, type TimelineBar } from "./timeline.ts";
import {
  useSearchSession,
  type SearchMode,
  type SearchStatus,
} from "./useSearchSession.ts";
import "./race-condition-lab.css";

export { fastDelayMs, slowDelayMs };

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

const delayTip = "Typed searches only; scenarios always use 600 ms, then 50 ms.";

export function RaceConditionLab({ search }: { search?: SearchFn }) {
  const [mode, setMode] = useState<SearchMode>("naive");
  const [delayMs, setDelayMs] = useState(fastDelayMs);
  const [failNext, setFailNext] = useState(false);
  const [kind, setKind] = useState<InspectorKind>("idle");
  const [phase, setPhase] = useState<"lesson" | "explore">("lesson");
  const [surface, setSurface] = useState<"harbour" | "search">("harbour");
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [scenarioId, setScenarioId] = useState<ScenarioId>("order");
  const [stepIndex, setStepIndex] = useState(0);
  const [predictions, setPredictions] = useState<Record<number, string | undefined>>({});
  const [simulatedSearch] = useState(createSimulatedSearch);
  const session = useSearchSession({
    search: search ?? simulatedSearch,
    mode,
  });
  const story = harbourStory(scenarioId);

  function runScenario(next: ScenarioId) {
    setSurface("search");
    setKind(next);
    setScenarioId(next);
    session.clear();
    for (const request of scenarios[next]) {
      session.searchFor(request.query, {
        delayMs: request.delayMs,
        fail: request.fail,
        useCache: false,
      });
    }
  }

  function openSearch() {
    setSurface("search");
    setKind("idle");
  }

  function restartLesson() {
    setPhase("lesson");
    setSurface("harbour");
    setScenarioId("order");
    setStepIndex(0);
    setPredictions({});
    setKind("idle");
    session.clear();
  }

  function skipToExploration() {
    setPhase("explore");
    openSearch();
  }

  function selectScenario(next: ScenarioId) {
    if (surface === "search") {
      runScenario(next);
      return;
    }
    const nextStory = harbourStory(next);
    if (!nextStory) {
      runScenario(next);
      return;
    }
    setScenarioId(next);
    setPredictions({});
    setStepIndex(0);
  }

  function onQueryChange(value: string) {
    if (value.trim().length === 0) {
      setKind("cleared");
      setFailNext(false);
      session.clear();
      return;
    }
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
  const scenarioKind =
    kind === "order" || kind === "sequence" || kind === "error" || kind === "duplicate" ? kind : null;
  const bridge =
    surface === "search" && scenarioKind
      ? describeBridge({
          scenarioId: scenarioKind,
          mode,
          query: session.query,
          resultsQuery: session.resultsQuery,
          requests: session.requests,
        })
      : null;

  const lessonStep = story?.steps[stepIndex];
  if (phase === "lesson" && story && lessonStep) {
    const lessonFrame = frameFor(story, stepIndex);
    const lessonSentence = acknowledgementFor(story, stepIndex, predictions) ?? lessonStep.caption;
    const lessonLast = stepIndex >= story.steps.length - 1;
    const lessonPrimary = lessonLast
      ? "See it in search"
      : lessonStep.briefing
        ? "Start the example"
        : "Next";

    return (
      <div className="race-lab race-lesson">
        <LessonShell
          chapter="The lighthouse"
          progress={`Step ${stepIndex + 1} of ${story.steps.length}`}
          title="The lighthouse"
          explanation={
            lessonStep.briefing ? (
              <div className="lighthouse-briefing">
                <p>{raceConditionCopy}</p>
                <p>{lighthouseSceneCopy}</p>
                <ul className="lighthouse-rules">
                  {lighthouseRules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
                <p>No messenger has been sent. The lamp is unlit because nothing has been applied.</p>
              </div>
            ) : (
              <p className="harbour-caption">{lessonSentence}</p>
            )
          }
          primaryLabel={lessonPrimary}
          onPrimary={() => {
            if (lessonLast) {
              setPhase("explore");
              runScenario(story.id);
              return;
            }
            setStepIndex(stepIndex + 1);
          }}
          showBack={stepIndex > 0}
          onBack={() => {
            setStepIndex((current) => (current <= 0 ? 0 : current - 1));
          }}
          onRestart={() => {
            setStepIndex(0);
            setPredictions({});
          }}
          onSkip={skipToExploration}
          primaryRef={primaryRef}
        >
          <HarbourScene
            embedded
            primaryRef={primaryRef}
            story={story}
            stepIndex={stepIndex}
            predictions={predictions}
            onSkip={skipToExploration}
            onPrediction={(choice) => {
              setPredictions((current) => ({
                ...current,
                [stepIndex]: choice ?? undefined,
              }));
            }}
            onBack={() => {
              setStepIndex((current) => (current <= 0 ? 0 : current - 1));
            }}
            onReplay={() => {
              setStepIndex(0);
              setPredictions({});
            }}
            onForward={() => {
              if (lessonLast) {
                setPhase("explore");
                runScenario(story.id);
                return;
              }
              setStepIndex(stepIndex + 1);
            }}
          />
        </LessonShell>
        <p className="visually-hidden" aria-live="polite" aria-atomic="true">
          {`Step ${stepIndex + 1} of ${story.steps.length}. ${lessonSentence} Assignment ${lessonFrame.assignment}. Signal ${lessonFrame.signalLabel}.`}
        </p>
      </div>
    );
  }

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
            Two messengers can each bring the right card, and the lamp can still
            be wrong. The walkthrough shows why. The search demo afterwards is
            the same sequence.
          </p>
          <button type="button" className="race-lesson-skip" onClick={restartLesson}>
            Restart the lesson
          </button>
        </div>
        <Disclosure label="Why this matters" panelId="race-why-panel">
          <p>
            The failure is intermittent, because latency varies. The screen still
            looks like a normal result list. What it shows can be another
            query&apos;s data, or an older error can wipe a newer success. This
            is a race condition: the outcome depends on arrival order the keeper
            does not control.
          </p>
        </Disclosure>
        <Disclosure label="How to handle it" panelId="race-handle-panel">
          <div className="race-fold">
            <p>Applying every settlement lets the response that finishes last decide the screen.</p>
            <pre className="ui-code">
              <code>{`function onSuccess(items: Item[]) {
  setResults(items);
}`}</code>
            </pre>
            <p>
              The check id !== latest is the keeper comparing the envelope with
              the logbook. Abort the previous request when a newer one starts.
              That retires the work. Still ignore a settlement whose id is no
              longer the latest. The id check decides the write. Clearing the
              query and unmount need a separate generation check, because that
              response can still be the latest id from a screen that is gone.
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
          </div>
        </Disclosure>
        <Disclosure label="Related Concepts" panelId="race-related-panel">
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
        </Disclosure>
      </>
      }
    >
      {surface === "search" ? <ScenarioBar
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
                  tip: "Every settlement writes, even a late older response.",
                },
                {
                  value: "protected",
                  label: "Protected",
                  tipId: "race-tip-protected",
                  tip: "Newer searches retire the previous request; late writes are ignored.",
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
                tip="Fails the next typed search once, then clears."
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
          tip='Issues "re" at 600 ms, then "rea" at 50 ms.'
          onClick={() => {
            selectScenario("order");
          }}
        />
        <TooltipButton
          variant="primary"
          label="In order"
          tipId="race-tip-sequence"
          tip='Issues "re" at 50 ms, then "rea" at 600 ms.'
          onClick={() => {
            selectScenario("sequence");
          }}
        />
        <TooltipButton
          variant="primary"
          label="Stale error"
          tipId="race-tip-error"
          tip='Like Out of order, but the slow "re" fails.'
          onClick={() => {
            selectScenario("error");
          }}
        />
        <TooltipButton
          variant="primary"
          label="Same query"
          tipId="race-tip-duplicate"
          tip='Issues "re" at 600 ms, then "re" again at 50 ms.'
          onClick={() => {
            selectScenario("duplicate");
          }}
        />
      </ScenarioBar> : null}

      <ExampleFrame
        label={
          surface === "harbour" ? (
            "Lighthouse"
          ) : (
            <label htmlFor="race-query">Search</label>
          )
        }
      >
        {surface === "harbour" ? (
          <HarbourScene
            story={story}
            stepIndex={stepIndex}
            predictions={predictions}
            onSkip={openSearch}
            onPrediction={(choice) => {
              setPredictions((current) => ({
                ...current,
                [stepIndex]: choice ?? undefined,
              }));
            }}
            onBack={() => {
              setStepIndex((current) => (current <= 0 ? 0 : current - 1));
            }}
            onReplay={() => {
              setStepIndex(0);
              setPredictions({});
            }}
            onForward={() => {
              if (!story) {
                return;
              }
              if (stepIndex >= story.steps.length - 1) {
                runScenario(story.id);
                return;
              }
              setStepIndex(stepIndex + 1);
            }}
          />
        ) : (
          <>
            {scenarioKind ? (
              <button
                type="button"
                className="ui-button harbour-return"
                onClick={() => {
                  setSurface("harbour");
                  setScenarioId(scenarioKind);
                  setStepIndex(0);
                  setPredictions({});
                }}
              >
                Show this in the lighthouse
              </button>
            ) : null}
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
          </>
        )}
      </ExampleFrame>

      {surface === "search" ? <div className="race-record">
        <section aria-label="Timeline">
          <h3>Timeline</h3>
          {session.requests.length === 0 ? (
            <p>No requests yet.</p>
          ) : (
            <ol className="race-timeline">
              {buildTimeline(session.requests).bars.map((bar) => {
                const label = timelineLabel(bar);
                const isMarker = bar.widthPct === 0;
                const pathStyle = (
                  isMarker
                    ? { left: `${bar.startPct}%` }
                    : {
                        left: `${bar.startPct}%`,
                        width: `${bar.widthPct}%`,
                        ["--race-duration" as string]: `${bar.delayMs}ms`,
                      }
                ) as CSSProperties;

                return (
                  <li key={bar.id}>
                    <div
                      className="race-lane"
                      data-outcome={bar.outcome}
                      style={laneStyle(bar.id, {})}
                    >
                      <span className="race-lane-label">{label}</span>
                      <div className="race-track">
                        <span
                          className={isMarker ? "race-marker" : "race-path"}
                          data-outcome={bar.outcome}
                          title={label}
                          style={pathStyle}
                        >
                          {isMarker ? null : (
                            <>
                              <span className="race-door" aria-hidden="true" />
                              <span
                                className="race-envelope"
                                data-outcome={bar.outcome}
                                aria-hidden="true"
                              >
                                {bar.id}
                              </span>
                            </>
                          )}
                        </span>
                      </div>
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
      </div> : null}

      {surface === "search" ? (
        <Explanation
          titleId="race-explanation-title"
          happened={bridge?.happened ?? inspector.happened}
          readout={
            bridge
              ? [
                  { term: "Search", detail: bridge.search },
                  { term: "Timeline", detail: bridge.timeline },
                  { term: "Requests", detail: bridge.requests },
                ]
              : [
                  { term: "Search", detail: inspector.search },
                  { term: "Timeline", detail: inspector.timeline },
                  { term: "Requests", detail: inspector.requests },
                ]
          }
        />
      ) : null}
    </LabSplit>
  );
}
