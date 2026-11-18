import { useEffect, useMemo, useRef } from "react";
import {
  createGuidedSearch,
  replayGuidedSearch,
  type GuidedSearchStep,
} from "./guidedSearch.ts";
import { Readouts, type Readout } from "./Readouts.tsx";
import type { TimelineOutcome } from "./timeline.ts";
import { useSearchSession } from "./useSearchSession.ts";

function requestState(outcome: TimelineOutcome): string {
  if (outcome === "pending") {
    return "On its way";
  }
  if (outcome === "ignored") {
    return "Arrived, not displayed";
  }
  if (outcome === "rejected") {
    return "Failed";
  }
  return "Arrived";
}

const samples = {
  request: "A request, on its way",
  response: "Its response, back with an answer",
  number: "The request number",
} as const;

export function GuidedSearchScene({ step }: { step: GuidedSearchStep }) {
  const player = useMemo(() => createGuidedSearch(), []);
  const session = useSearchSession({ search: player.search, mode: step.mode });
  const sessionRef = useRef(session);
  const outcomes = session.requests.map((request) => `${request.id}:${request.outcome}`).join(" ");

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    replayGuidedSearch(sessionRef.current, player, step.cues);
    return () => {
      player.invalidate();
    };
  }, [player, step.cues]);

  const showing = session.status === "success";
  const mismatch = showing && session.resultsQuery !== session.query;
  const onRequests = step.emphasis === "request" || step.emphasis === "response" || step.emphasis === "number";
  const sample = session.requests.length === 0 && onRequests
    ? samples[step.emphasis as keyof typeof samples]
    : null;
  const readouts: Readout[] = [
    {
      label: "Text in the box",
      value: session.query === "" ? "Empty" : `"${session.query}"`,
      tone: session.query === "" ? "quiet" : undefined,
    },
    {
      label: "Results on screen",
      value: showing ? `For "${session.resultsQuery}"` : "Nothing yet",
      tone: mismatch ? "alert" : showing ? undefined : "quiet",
      note: mismatch ? "Not what the box says" : "",
    },
  ];

  return (
    <div className="race-lesson-search" data-search-step={step.id} data-outcomes={outcomes}>
      <div className="race-search-view">
        {step.showBox ? (
          <div className="race-search-page">
            {step.rule ? (
              <p className="race-lesson-rule">
                <span>This page&apos;s rule</span>
                <strong>{step.rule}</strong>
              </p>
            ) : null}
            <div className="race-search-part" data-emphasis={step.emphasis === "box" ? "true" : "false"}>
              <div className="ui-field">
                <label htmlFor="guided-query">Search</label>
                <input
                  id="guided-query"
                  type="search"
                  readOnly
                  value={session.query}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              {step.emphasis === "box" ? (
                <p className="race-lesson-beside">The text in the box is the open channel.</p>
              ) : null}
            </div>
            <div className="race-search-part" data-emphasis={onRequests ? "true" : "false"}>
              {session.requests.length > 0 || sample ? (
                <ul className="race-search-requests">
                  {session.requests.map((request) => (
                    <li key={request.id} data-outcome={request.outcome}>
                      <b>{`#${request.id}`}</b>
                      <span>{`${request.query} · ${requestState(request.outcome)}`}</span>
                    </li>
                  ))}
                  {sample ? (
                    <li data-outcome="sample">
                      <b>#1</b>
                      <span>{sample}</span>
                    </li>
                  ) : null}
                </ul>
              ) : (
                <p className="race-search-quiet">No request has been sent.</p>
              )}
              {step.emphasis === "request" ? (
                <p className="race-lesson-beside">Sending a request asks for a card.</p>
              ) : null}
              {step.emphasis === "response" ? (
                <p className="race-lesson-beside">The response is the card that comes back.</p>
              ) : null}
              {step.emphasis === "number" ? (
                <p className="race-lesson-beside">The envelope number is the request number.</p>
              ) : null}
            </div>
            <div className="race-search-part" data-emphasis={step.emphasis === "results" ? "true" : "false"}>
              {showing ? (
                <div className="race-search-results">
                  <h3>{`Results for "${session.resultsQuery}"`}</h3>
                  <ul>
                    {session.results.map((item) => (
                      <li key={item.id}>{item.label}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="race-search-quiet">Nothing is displayed yet.</p>
              )}
              {step.emphasis === "results" ? (
                <p className="race-lesson-beside">The results on screen are the light ships follow.</p>
              ) : null}
            </div>
          </div>
        ) : (
          <ol className="race-search-relay">
            <li>
              <b>1</b>
              <span>You type in the box</span>
            </li>
            <li>
              <b>2</b>
              <span>The page asks another computer</span>
            </li>
            <li>
              <b>3</b>
              <span>The answer comes back later</span>
            </li>
          </ol>
        )}
      </div>
      <Readouts items={readouts} />
    </div>
  );
}
