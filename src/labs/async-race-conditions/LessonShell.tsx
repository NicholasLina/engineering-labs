import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";

/**
 * The guided lesson's page. The picture sits beside one column that reads top
 * to bottom: where you are, what this step is, what it means, what to do next.
 */
export function LessonShell({
  chapter,
  place,
  total,
  title,
  stepId,
  explanation,
  primaryLabel,
  onPrimary,
  showBack,
  onBack,
  onRestart,
  onSkip,
  primaryRef,
  children,
}: {
  chapter: string;
  /** This step's position in its chapter, starting at 1. */
  place: number;
  total: number;
  title: string;
  stepId: string;
  explanation: ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  showBack: boolean;
  onBack: () => void;
  onRestart: () => void;
  onSkip: () => void;
  primaryRef: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef<string | null>(null);

  useEffect(() => {
    if (previousStep.current === null || previousStep.current === stepId) {
      previousStep.current = stepId;
      return;
    }
    previousStep.current = stepId;
    titleRef.current?.focus();
  }, [stepId]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
      return;
    }
    event.preventDefault();
    if (event.key === "ArrowRight") {
      onPrimary();
      return;
    }
    if (showBack) {
      onBack();
    }
  }

  return (
    <div className="race-lesson-frame" data-lesson="guided">
      <h2 id="race-lab-title" className="visually-hidden">
        Race Condition
      </h2>
      <div className="race-lesson-top">
        <p className="back-link">
          <a href="#labs">Back to labs</a>
        </p>
        <button type="button" className="race-lesson-skip" onClick={onSkip}>
          Skip to exploration
        </button>
      </div>
      <div className="race-lesson-card">
        <header className="race-lesson-head">
          <p className="race-lesson-progress">
            <span>{chapter}</span>
            <span>{`${place} of ${total}`}</span>
          </p>
          <div className="race-lesson-pips" aria-hidden="true">
            {Array.from({ length: total }, (_, index) => (
              <span key={index} data-done={index < place ? "true" : "false"} />
            ))}
          </div>
          <h2 className="race-lesson-title" tabIndex={-1} ref={titleRef}>
            {title}
          </h2>
        </header>
        <div className="race-lesson-scene">{children}</div>
        <div className="race-lesson-copy">{explanation}</div>
        <div className="race-lesson-actions" role="group" aria-label="Lesson" onKeyDown={onKeyDown}>
          <button
            type="button"
            className="ui-button ui-button-primary"
            ref={primaryRef}
            onClick={onPrimary}
          >
            {primaryLabel}
          </button>
          {showBack ? (
            <button type="button" className="ui-button" onClick={onBack}>
              Back
            </button>
          ) : null}
          <button type="button" className="race-lesson-quiet" onClick={onRestart}>
            Restart the lesson
          </button>
        </div>
      </div>
    </div>
  );
}
