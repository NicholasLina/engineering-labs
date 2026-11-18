import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { HarbourCanvas } from "./HarbourCanvas.tsx";
import type { SceneRoute } from "./harbourPicture.ts";
import { scenarios, slowDelayMs } from "./scenarios.ts";
import {
  acknowledgementFor,
  frameFor,
  lighthouseRules,
  lighthouseSceneCopy,
  raceConditionCopy,
  type HarbourStory,
} from "./harbour.ts";

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => {
      setReduced(query.matches);
    };
    onChange();
    query.addEventListener("change", onChange);
    return () => {
      query.removeEventListener("change", onChange);
    };
  }, []);

  return reduced;
}

function storyRoutes(story: HarbourStory): SceneRoute[] {
  return scenarios[story.id].map((request, slot) => ({
    id: request.id,
    channel: request.channel,
    kind: request.delayMs >= slowDelayMs ? "long" : "short",
    slot,
  }));
}

export function HarbourScene({
  story,
  stepIndex,
  predictions,
  onSkip,
  onPrediction,
  onBack,
  onReplay,
  onForward,
  embedded = false,
  primaryRef,
}: {
  story: HarbourStory | null;
  stepIndex: number;
  predictions: Readonly<Record<number, string | undefined>>;
  onSkip: () => void;
  onPrediction: (choice: string | null) => void;
  onBack: () => void;
  onReplay: () => void;
  onForward: () => void;
  embedded?: boolean;
  primaryRef?: RefObject<HTMLButtonElement | null>;
}) {
  const reducedMotion = useReducedMotion();
  const forwardRef = useRef<HTMLButtonElement>(null);
  const captionId = useId();

  if (!story) {
    return (
      <div className="harbour-actions">
        <button type="button" className="ui-button ui-button-outline" onClick={onSkip}>
          Skip to search demo
        </button>
      </div>
    );
  }

  const step = story.steps[stepIndex];
  if (!step) {
    return null;
  }

  const frame = frameFor(story, stepIndex);
  const routes = storyRoutes(story);
  const acknowledgement = acknowledgementFor(story, stepIndex, predictions);
  const sentence = acknowledgement ?? step.caption;
  const choice = predictions[stepIndex];
  const last = stepIndex === story.steps.length - 1;
  const spoken = [
    `Step ${stepIndex + 1} of ${story.steps.length}.`,
    step.briefing ? raceConditionCopy : null,
    step.briefing ? lighthouseSceneCopy : sentence,
    step.briefing ? "No messenger has been sent." : null,
    `Assignment ${frame.assignment}.`,
    `Signal ${frame.signalLabel}.`,
    `Produced by ${frame.producedBy}.`,
  ].filter((part) => part).join(" ");

  function focusPrimary() {
    primaryRef?.current?.focus();
    forwardRef.current?.focus();
  }

  return (
    <div className="harbour-walk" data-step={stepIndex + 1}>
      {embedded ? null : (
        <p className="visually-hidden" aria-live="polite" aria-atomic="true">
          {spoken}
        </p>
      )}
      <div className="harbour-layout" data-motion={reducedMotion ? "reduced" : "ok"}>
        <HarbourCanvas
          frame={frame}
          routes={routes}
          focus={step.briefing ? null : step.focus}
          reducedMotion={reducedMotion}
        />
      </div>
      {embedded ? null : (
        <dl className="race-readouts">
          <div>
            <dt>Logbook</dt>
            <dd>{frame.assignment}</dd>
          </div>
          <div data-signal={frame.signal}>
            <dt>Lamp</dt>
            <dd>{frame.signalLabel}</dd>
          </div>
          <div>
            <dt>Report applied</dt>
            <dd>{frame.producedBy === "No report yet" ? "No report yet" : `from ${frame.producedBy}`}</dd>
          </div>
        </dl>
      )}
      {embedded ? null : step.briefing ? (
        <div className="lighthouse-briefing" id={captionId}>
          <p>{raceConditionCopy}</p>
          <p>{lighthouseSceneCopy}</p>
          <p>This picture keeps a few limits, and each one is part of the race.</p>
          <ul className="lighthouse-rules">
            {lighthouseRules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
          <p>No messenger has been sent. The lamp is unlit because nothing has been applied.</p>
        </div>
      ) : (
        <p id={captionId} className="harbour-caption">
          {sentence}
        </p>
      )}
      {!embedded && step.prompt ? (
        <div className="harbour-choices" role="group" aria-label="Prediction" data-prediction="true">
          <div className="harbour-actions">
            {step.prompt.choices.map((option) => (
              <button
                key={option.id}
                type="button"
                className="ui-button"
                aria-pressed={choice === option.id}
                onClick={() => {
                  onPrediction(option.id);
                  focusPrimary();
                }}
              >
                {option.label}
              </button>
            ))}
            <button
              type="button"
              className="ui-button ui-button-outline"
              onClick={() => {
                onPrediction(null);
                focusPrimary();
              }}
            >
              Show the outcome
            </button>
          </div>
        </div>
      ) : null}
      {embedded ? null : <div
        className="harbour-actions"
        role="group"
        aria-label="Walkthrough"
        onKeyDown={(event) => {
          if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
            return;
          }
          event.preventDefault();
          if (event.key === "ArrowRight") {
            onForward();
            return;
          }
          onBack();
        }}
      >
        <button type="button" className="ui-button" onClick={onBack}>
          Back
        </button>
        <button type="button" className="ui-button" onClick={onReplay}>
          Replay
        </button>
        <button type="button" className="ui-button ui-button-outline" onClick={onSkip}>
          Skip to search demo
        </button>
        <button
          type="button"
          className="ui-button ui-button-primary"
          ref={forwardRef}
          onClick={onForward}
        >
          {last ? "See it in search" : step.briefing ? "Start the example" : "Next"}
        </button>
        <p className="harbour-step-count">{`Step ${stepIndex + 1} of ${story.steps.length}`}</p>
      </div>}
    </div>
  );
}
