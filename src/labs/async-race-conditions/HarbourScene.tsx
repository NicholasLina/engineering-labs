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

const longRoute = [
  { x: 196, y: 176 },
  { x: 300, y: 86 },
  { x: 450, y: 46 },
  { x: 590, y: 78 },
  { x: 688, y: 124 },
];

const shortRoute = [
  { x: 196, y: 248 },
  { x: 390, y: 270 },
  { x: 620, y: 292 },
];

function along(points: readonly { x: number; y: number }[], t: number): { x: number; y: number } {
  const lengths: number[] = [];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    if (!previous || !next) {
      continue;
    }
    const length = Math.hypot(next.x - previous.x, next.y - previous.y);
    lengths.push(length);
    total += length;
  }
  let remaining = Math.min(Math.max(t, 0), 1) * total;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    const length = lengths[index - 1] ?? 0;
    if (!previous || !next) {
      continue;
    }
    if (remaining <= length || index === points.length - 1) {
      const share = length === 0 ? 0 : remaining / length;
      return {
        x: previous.x + (next.x - previous.x) * share,
        y: previous.y + (next.y - previous.y) * share,
      };
    }
    remaining -= length;
  }
  return points[0] ?? { x: 0, y: 0 };
}

function routePath(points: readonly { x: number; y: number }[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function messengerPoint(
  route: "long" | "short",
  progress: string,
  id = 1,
): { x: number; y: number } {
  const line = route === "long" ? longRoute : shortRoute;
  if (progress === "en-route") {
    return along(line, 0.62);
  }
  if (progress === "set-aside") {
    return { x: 470 + id * 34, y: 392 };
  }
  return { x: 148 + id * 30, y: route === "long" ? 186 : 248 };
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
    ? { x: 94, y: 148 }
    : step.focus.target === "logbook" || step.focus.target === "numbers"
      ? { x: 340, y: 386 }
      : messengerPoint(focused?.route ?? "long", focused?.progress ?? "en-route", focused?.id ?? 1);
  const numberId = step.focus.target === "numbers" ? step.focus.id : undefined;
  const numberMessenger = numberId === undefined
    ? undefined
    : frame.messengers.find((messenger) => messenger.id === numberId);
  const numberPoint = numberMessenger
    ? messengerPoint(numberMessenger.route, numberMessenger.progress, numberMessenger.id)
    : null;
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
          viewBox="0 0 760 420"
          role="img"
          aria-hidden="true"
          data-signal={frame.signal}
          data-focus={step.focus.target}
        >
          <rect width="760" height="420" fill="#0c1222" />
          <rect y="168" width="760" height="192" fill="#0b1c30" />
          <polygon points="220,190 390,196 520,150 640,168 700,120 620,70 470,58 360,110 250,168" fill="#44403c" />
          <text x="470" y="128" fill="#d6d3d1" fontSize="12" fontFamily="sans-serif">
            Headland
          </text>
          <rect y="360" width="760" height="60" fill="#111827" />
          <path d={routePath(longRoute)} fill="none" stroke="#94a3b8" strokeDasharray="8 7" strokeWidth="2" />
          <text x="520" y="64" fill="#e7e5e4" fontSize="12" fontFamily="sans-serif">
            Around the headland
          </text>
          <path d={routePath(shortRoute)} fill="none" stroke="#94a3b8" strokeDasharray="8 7" strokeWidth="2" />
          <text x="250" y="292" fill="#e7e5e4" fontSize="12" fontFamily="sans-serif">
            Across the harbour
          </text>
          <g className="harbour-station" data-station="west" transform="translate(688 78)">
            <polygon points="-30,-8 0,-28 30,-8" fill="#78716c" />
            <rect x="-26" y="-8" width="52" height="34" fill="#292524" />
            <text y="42" textAnchor="middle" fill="#e7e5e4" fontSize="13" fontFamily="sans-serif">West</text>
            <text y="56" textAnchor="middle" fill="#fdba74" fontSize="11" fontFamily="sans-serif">Sends amber</text>
          </g>
          <g className="harbour-station" data-station="east" transform="translate(620 250)">
            <polygon points="-30,-8 0,-28 30,-8" fill="#78716c" />
            <rect x="-26" y="-8" width="52" height="34" fill="#292524" />
            <text y="42" textAnchor="middle" fill="#e7e5e4" fontSize="13" fontFamily="sans-serif">East</text>
            <text y="56" textAnchor="middle" fill="#93c5fd" fontSize="11" fontFamily="sans-serif">Sends blue</text>
          </g>
          <polygon points="62,134 126,134 94,102" fill="#44403c" />
          {frame.signal === "amber" || frame.signal === "blue" ? (
            <circle cx="94" cy="148" r="28" fill={lampFill(frame.signal)} opacity="0.35" />
          ) : null}
          <rect x="76" y="134" width="36" height="28" fill={lampFill(frame.signal)} stroke="#e7e5e4" />
          <rect x="68" y="162" width="52" height="7" fill="#44403c" />
          <rect x="84" y="169" width="20" height="36" fill="#e7e5e4" />
          <rect x="84" y="205" width="20" height="10" fill="#a8a29e" />
          <rect x="84" y="215" width="20" height="36" fill="#e7e5e4" />
          <rect x="84" y="251" width="20" height="10" fill="#a8a29e" />
          <rect x="84" y="261" width="20" height="48" fill="#e7e5e4" />
          <rect className="harbour-door" x="88" y="286" width="12" height="22" fill="#292524" />
          <g className="harbour-keeper" transform="translate(132 318)">
            <path d="M-6 0 L-12 18" stroke="#e7e5e4" strokeWidth="2.6" strokeLinecap="round" />
            <path d="M5 0 L11 18" stroke="#e7e5e4" strokeWidth="2.6" strokeLinecap="round" />
            <rect x="-12" y="-22" width="24" height="24" rx="5" fill="#1c1917" />
            <circle cx="0" cy="-32" r="8" fill="#fdba74" />
            <path d="M-9 -34 H9 L7 -40 H-7 Z" fill="#44403c" />
            <text y="32" textAnchor="middle" fill="#e7e5e4" fontSize="12" fontFamily="sans-serif">Keeper</text>
          </g>
          <text x="16" y="392" fill="#e7e5e4" fontSize="13" fontFamily="sans-serif">
            {frame.signalLabel}
          </text>
          <text x="16" y="408" fill="#cbd5e1" fontSize="12" fontFamily="sans-serif">
            {frame.producedBy === "No report yet" ? "No report yet" : `from ${frame.producedBy}`}
          </text>
          <rect x="236" y="368" width="210" height="40" fill="#f5f0e6" />
          <text x="246" y="384" fill="#78716c" fontSize="11" fontFamily="sans-serif">
            Logbook
          </text>
          <text x="246" y="400" fill="#1c1917" fontSize="14" fontFamily="sans-serif">
            {frame.assignment}
          </text>
          {frame.setAside.length > 0 ? (
            <g className="harbour-tray">
              <rect x="470" y="368" width="250" height="40" fill="#1c1917" stroke="#a8a29e" />
              {frame.setAside.map((messenger, index) => (
                <g key={messenger.id} transform={`translate(${484 + index * 70} 378)`}>
                  <rect width="58" height="18" fill={messenger.card === "blue" ? "#1d4ed8" : messenger.card === "amber" ? "#b45309" : "#f8fafc"} />
                  <text x="29" y="13" textAnchor="middle" fill={messenger.card ? "#fff7ed" : "#1c1917"} fontSize="11" fontFamily="sans-serif">
                    {`#${messenger.id}`}
                  </text>
                </g>
              ))}
            </g>
          ) : null}
          {frame.messengers.map((messenger) => {
            const point = messengerPoint(messenger.route, messenger.progress, messenger.id);
            const card = messenger.progress === "set-aside"
              ? null
              : handedCard(messenger, frame.producedBy, frame.signal);
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
                data-card={card ?? ""}
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
            {numberPoint ? (
              <circle
                cx={numberPoint.x}
                cy={numberPoint.y - 10}
                r="18"
                fill="none"
                stroke="#fdba74"
                strokeWidth="2"
              />
            ) : null}
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
