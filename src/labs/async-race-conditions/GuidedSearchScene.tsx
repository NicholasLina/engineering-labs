import { useEffect, useMemo, useRef } from "react";
import {
  createGuidedSearch,
  replayGuidedSearch,
  type GuidedSearchStep,
} from "./guidedSearch.ts";
import { useSearchSession } from "./useSearchSession.ts";

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

  return (
    <div className="race-lesson-search" data-search-step={step.id} data-outcomes={outcomes}>
      {step.rule ? <p className="race-lesson-rule">{step.rule}</p> : null}
      {step.showBox ? (
        <div className="ui-field" data-emphasis={step.emphasis === "box" ? "true" : "false"}>
          <label htmlFor="guided-query">Search</label>
          <input
            id="guided-query"
            type="search"
            readOnly
            value={session.query}
            autoComplete="off"
            spellCheck={false}
          />
          {step.emphasis === "box" ? (
            <p className="race-lesson-beside">The text in the box is the current assignment.</p>
          ) : null}
        </div>
      ) : null}
      {step.emphasis === "request" ? (
        <p className="race-lesson-beside" data-emphasis="true">
          Sending a request asks for results.
        </p>
      ) : null}
      {step.emphasis === "response" ? (
        <p className="race-lesson-beside" data-emphasis="true">
          The response is the answer that comes back.
        </p>
      ) : null}
      {step.emphasis === "number" ? (
        <p className="race-lesson-beside" data-emphasis="true">
          The envelope number is the request number.
        </p>
      ) : null}
      <div data-emphasis={step.emphasis === "results" ? "true" : "false"}>
        {session.status === "success" ? (
          <>
            <h3>{`Results for "${session.resultsQuery}"`}</h3>
            <ul>
              {session.results.map((item) => (
                <li key={item.id}>{item.label}</li>
              ))}
            </ul>
          </>
        ) : (
          <p>Nothing is displayed yet.</p>
        )}
        {step.emphasis === "results" ? (
          <p className="race-lesson-beside">The light is the results on screen.</p>
        ) : null}
      </div>
    </div>
  );
}
