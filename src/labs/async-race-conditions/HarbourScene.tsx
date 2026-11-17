import { useEffect, useId, useRef, useState, type RefObject } from "react";
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

function lampFill(signal: string): string {
  if (signal === "amber") {
    return "#b45309";
  }
  if (signal === "blue") {
    return "#1d4ed8";
  }
  if (signal === "dark") {
    return "#1c1917";
  }
  return "#e7e5e4";
}

function messengerPoint(route: "long" | "short", progress: string): { x: number; y: number } {
  const y = route === "long" ? 168 : 236;
  const door = 196;
  const far = route === "long" ? 640 : 340;
  const x = progress === "en-route" ? door + (far - door) * 0.62 : door;
  return { x, y };
}

function MessengerFigure({
  id,
  outbound,
  card,
  slip,
  ignored,
}: {
  id: number;
  outbound: boolean;
  card: "amber" | "blue" | null;
  slip: boolean;
  ignored: boolean;
}) {
  const face = outbound ? 1 : -1;
  return (
    <g>
      <g transform={`scale(${face} 1)`}>
        <path d="M-5 6 L-10 20" stroke="#e7e5e4" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M4 6 L9 20" stroke="#e7e5e4" strokeWidth="2.6" strokeLinecap="round" />
        <rect x="-12" y="-16" width="24" height="24" rx="5" fill="#44403c" />
        <circle cx="0" cy="-26" r="7" fill="#fdba74" />
        <path d="M-8 -28 H8 L6 -33 H-6 Z" fill="#1c1917" />
        <rect x="8" y="-10" width="9" height="12" rx="1" fill="#b45309" />
      </g>
      <circle cx="0" cy="-6" r="7" fill="#f5f0e6" />
      <text x="0" y="-6" textAnchor="middle" dominantBaseline="middle" fill="#1c1917" fontSize="11" fontFamily="sans-serif">
        {id}
      </text>
      {card ? (
        <g>
          <rect x="18" y="-34" width="54" height="16" fill={card === "amber" ? "#b45309" : "#1d4ed8"} />
          <text x="45" y="-26" textAnchor="middle" dominantBaseline="middle" fill="#fff7ed" fontSize="11" fontFamily="sans-serif">
            {card === "amber" ? "Amber" : "Blue"}
          </text>
        </g>
      ) : null}
      {slip ? (
        <g>
          <rect x="18" y="-34" width="42" height="16" fill="#f8fafc" stroke="#78716c" strokeDasharray="3 2" />
          <text x="39" y="-26" textAnchor="middle" dominantBaseline="middle" fill="#1c1917" fontSize="11" fontFamily="sans-serif">
            Slip
          </text>
        </g>
      ) : null}
      {!card && !slip ? (
        <g>
          <rect x="18" y="-32" width="16" height="12" fill="#f5f0e6" stroke="#a8a29e" />
          <path d="M18 -32 L26 -26 L34 -32" fill="none" stroke="#a8a29e" />
        </g>
      ) : null}
      {ignored ? (
        <text x="0" y="34" textAnchor="middle" fill="#e7e5e4" fontSize="12" fontFamily="sans-serif">
          Ignored
        </text>
      ) : null}
    </g>
  );
}

function handedCard(
  messenger: { id: number; card: "amber" | "blue" | null; progress: string },
  producedBy: string,
  signal: string,
): "amber" | "blue" | null {
  if (messenger.card) {
    return messenger.card;
  }
  const producedThis = producedBy === `#${messenger.id}`;
  if (messenger.progress === "delivered" && producedThis && (signal === "amber" || signal === "blue")) {
    return signal;
  }
  return null;
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
  const acknowledgement = acknowledgementFor(story, stepIndex, predictions);
  const sentence = acknowledgement ?? step.caption;
  const choice = predictions[stepIndex];
  const last = stepIndex === story.steps.length - 1;
  const focused = frame.messengers.find((messenger) =>
    step.focus.target === "messenger" ? messenger.id === step.focus.id : false,
  );
  const focusPoint = step.focus.target === "lamp"
    ? { x: 94, y: 164 }
    : step.focus.target === "logbook"
      ? { x: 540, y: 332 }
      : messengerPoint(focused?.route ?? "long", focused?.progress ?? "en-route");
  const idle = frame.messengers.length === 0;
  const showLong = idle || frame.messengers.some((messenger) => messenger.route === "long");
  const showShort = idle || frame.messengers.some((messenger) => messenger.route === "short");
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
        <svg
          className="harbour-scene harbour-lamp"
          viewBox="0 0 760 360"
          role="img"
          aria-hidden="true"
          data-signal={frame.signal}
          data-focus={step.focus.target}
        >
          <rect width="760" height="360" fill="#0c1222" />
          <rect y="308" width="760" height="52" fill="#111827" />
          {showLong ? (
            <g>
              <line x1="196" y1="168" x2="700" y2="168" stroke="#94a3b8" strokeDasharray="8 7" />
              <text x="612" y="156" fill="#94a3b8" fontSize="12" fontFamily="sans-serif">
                Longer route
              </text>
              <line className="harbour-door" x1="126" y1="168" x2="188" y2="168" stroke="#e7e5e4" strokeWidth="5" />
            </g>
          ) : null}
          {showShort ? (
            <g>
              <line x1="196" y1="236" x2="360" y2="236" stroke="#94a3b8" strokeDasharray="8 7" />
              <text x="368" y="232" fill="#94a3b8" fontSize="12" fontFamily="sans-serif">
                Shorter route
              </text>
              <line className="harbour-door" x1="126" y1="236" x2="188" y2="236" stroke="#e7e5e4" strokeWidth="5" />
            </g>
          ) : null}
          <polygon points="62,150 126,150 94,118" fill="#44403c" />
          {frame.signal === "amber" || frame.signal === "blue" ? (
            <circle cx="94" cy="164" r="28" fill={lampFill(frame.signal)} opacity="0.35" />
          ) : null}
          <rect x="76" y="150" width="36" height="28" fill={lampFill(frame.signal)} stroke="#e7e5e4" />
          <rect x="68" y="178" width="52" height="7" fill="#44403c" />
          <rect x="84" y="185" width="20" height="28" fill="#e7e5e4" />
          <rect x="84" y="213" width="20" height="10" fill="#a8a29e" />
          <rect x="84" y="223" width="20" height="28" fill="#e7e5e4" />
          <rect x="84" y="251" width="20" height="10" fill="#a8a29e" />
          <rect x="84" y="261" width="20" height="36" fill="#e7e5e4" />
          <rect className="harbour-door" x="88" y="275" width="12" height="22" fill="#292524" />
          <text x="94" y="332" textAnchor="middle" fill="#e7e5e4" fontSize="13" fontFamily="sans-serif">
            {frame.signalLabel}
          </text>
          <text x="94" y="348" textAnchor="middle" fill="#cbd5e1" fontSize="12" fontFamily="sans-serif">
            {frame.producedBy === "No report yet" ? "No report yet" : `from ${frame.producedBy}`}
          </text>
          <rect x="430" y="312" width="220" height="40" fill="#f5f0e6" />
          <text x="442" y="328" fill="#78716c" fontSize="11" fontFamily="sans-serif">
            Logbook
          </text>
          <text x="442" y="344" fill="#1c1917" fontSize="14" fontFamily="sans-serif">
            {frame.assignment}
          </text>
          {frame.messengers.map((messenger) => {
            const point = messengerPoint(messenger.route, messenger.progress);
            const card = handedCard(messenger, frame.producedBy, frame.signal);
            const slip = Boolean(messenger.slipText)
              || (messenger.progress === "delivered" && frame.signal === "dark" && frame.producedBy === `#${messenger.id}`);
            return (
              <g
                key={messenger.id}
                className="harbour-messenger"
                data-messenger={messenger.id}
                data-progress={messenger.progress}
                data-route={messenger.route}
                data-carrying={messenger.carrying}
                transform={`translate(${point.x} ${point.y})`}
              >
                <MessengerFigure
                  id={messenger.id}
                  outbound={messenger.progress === "en-route"}
                  card={card}
                  slip={slip}
                  ignored={messenger.progress === "set-aside"}
                />
              </g>
            );
          })}
          <g className="harbour-callout" data-focus={step.focus.target}>
            <circle
              cx={focusPoint.x}
              cy={step.focus.target === "messenger" ? focusPoint.y - 10 : focusPoint.y}
              r={step.focus.target === "logbook" ? 28 : 24}
              fill="none"
              stroke="#fdba74"
              strokeWidth="2"
            />
          </g>
        </svg>
      </div>
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
      {step.prompt ? (
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
