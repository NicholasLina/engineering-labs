import { useEffect, useId, useRef, useState } from "react";
import {
  acknowledgementFor,
  frameFor,
  premiseCopy,
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

function channelLabel(channel: "west" | "east"): string {
  return channel === "west" ? "West" : "East";
}

export function HarbourScene({
  story,
  stepIndex,
  predictions,
  onStart,
  onSkip,
  onPrediction,
  onBack,
  onReplay,
  onForward,
}: {
  story: HarbourStory | null;
  stepIndex: number | null;
  predictions: Readonly<Record<number, string | undefined>>;
  onStart: () => void;
  onSkip: () => void;
  onPrediction: (choice: string | null) => void;
  onBack: () => void;
  onReplay: () => void;
  onForward: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const forwardRef = useRef<HTMLButtonElement>(null);
  const questionId = useId();
  const captionId = useId();

  if (stepIndex === null || !story) {
    return (
      <div className="harbour-premise">
        <p>{premiseCopy}</p>
        {story?.setup ? <p>{story.setup}</p> : null}
        {!story ? (
          <p>This scenario runs in the search demo. Out of order is the walkthrough.</p>
        ) : null}
        <div className="harbour-actions">
          {story ? (
            <button type="button" className="ui-button ui-button-primary" onClick={onStart}>
              Start walkthrough
            </button>
          ) : null}
          <button type="button" className="ui-button ui-button-outline" onClick={onSkip}>
            Skip to search demo
          </button>
        </div>
      </div>
    );
  }

  const step = story.steps[stepIndex];
  if (!step) {
    return null;
  }

  const frame = frameFor(story, stepIndex);
  const acknowledgement = acknowledgementFor(story, stepIndex, predictions);
  const choice = predictions[stepIndex];
  const last = stepIndex === story.steps.length - 1;
  const spoken = [
    `Step ${stepIndex + 1} of ${story.steps.length}.`,
    acknowledgement,
    step.caption,
    `Current assignment: ${frame.assignment}.`,
    `Displayed signal: ${frame.signalLabel}.`,
    `Produced by: ${frame.producedBy}.`,
  ]
    .filter((part) => part)
    .join(" ");

  return (
    <div className="harbour-walk" data-step={stepIndex + 1}>
      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {spoken}
      </p>
      {story.setup ? <p className="harbour-setup">{story.setup}</p> : null}
      <div className="harbour-layout" data-motion={reducedMotion ? "reduced" : "ok"}>
        <div className="harbour-lamp" data-signal={frame.signal} aria-hidden="true">
          <div className="harbour-beacon">
            <span className="harbour-roof" />
            <span className="harbour-lamp-glow" />
            <span className="harbour-gallery" />
            <span className="harbour-shaft" />
          </div>
          <p className="harbour-lamp-label">{frame.signalLabel}</p>
          {frame.producedBy === "No report yet" ? null : (
            <p className="harbour-lamp-from">{`from ${frame.producedBy}`}</p>
          )}
        </div>
        <div className="harbour-detail">
          <ol className="harbour-routes" aria-hidden="true">
            {frame.messengers.map((messenger) => (
              <li key={messenger.id}>
                <span className="harbour-route-name">
                  {messenger.route === "long" ? "Longer route" : "Shorter route"}
                  {` · #${messenger.id} · ${channelLabel(messenger.channel)}`}
                </span>
                <div className="harbour-track" data-route={messenger.route}>
                  <span className="harbour-door" />
                  <span
                    className="harbour-messenger"
                    data-messenger={messenger.id}
                    data-progress={messenger.progress}
                    data-route={messenger.route}
                    data-carrying={messenger.carrying}
                  >
                    <span className="harbour-envelope">{messenger.id}</span>
                    {messenger.card ? (
                      <span className="harbour-card" data-card={messenger.card}>
                        {messenger.card === "amber" ? "Amber" : "Blue"}
                      </span>
                    ) : null}
                    {messenger.slipText ? (
                      <span className="harbour-slip">{messenger.slipText}</span>
                    ) : null}
                    {messenger.progress === "set-aside" ? (
                      <span className="harbour-ignored">Ignored</span>
                    ) : null}
                  </span>
                </div>
              </li>
            ))}
          </ol>
          <dl className="harbour-facts">
            <div>
              <dt>Current assignment</dt>
              <dd>{frame.assignment}</dd>
            </div>
            <div>
              <dt>Displayed signal</dt>
              <dd>{frame.signalLabel}</dd>
            </div>
            <div>
              <dt>Produced by</dt>
              <dd>{frame.producedBy}</dd>
            </div>
          </dl>
          <ol className="harbour-log" aria-label="Logbook">
            {frame.log.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </div>
      </div>
      <p id={captionId} className="harbour-caption">
        {acknowledgement ? `${acknowledgement} ${step.caption}` : step.caption}
      </p>
      {step.prompt ? (
        <div className="harbour-choices" role="group" aria-labelledby={questionId} data-prediction="true">
          <p id={questionId}>{step.prompt.question}</p>
          <div className="harbour-actions">
            {step.prompt.choices.map((option) => (
              <button
                key={option.id}
                type="button"
                className="ui-button"
                aria-pressed={choice === option.id}
                onClick={() => {
                  onPrediction(option.id);
                  forwardRef.current?.focus();
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
                forwardRef.current?.focus();
              }}
            >
              Show the outcome
            </button>
          </div>
        </div>
      ) : null}
      <div
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
        <button
          type="button"
          className="ui-button ui-button-primary"
          ref={forwardRef}
          onClick={onForward}
        >
          {last ? "See it in search" : "Next"}
        </button>
        <p className="harbour-step-count">{`Step ${stepIndex + 1} of ${story.steps.length}`}</p>
      </div>
    </div>
  );
}
