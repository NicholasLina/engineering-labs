import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";

export function LessonShell({
  chapter,
  progress,
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
  progress: string;
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
      <p className="back-link">
        <a href="#labs">Back to labs</a>
      </p>
      <p className="race-lesson-progress">
        <span>{chapter}</span>
        <span>{progress}</span>
      </p>
      <h2 className="race-lesson-title" tabIndex={-1} ref={titleRef}>
        {title}
      </h2>
      <div className="race-lesson-stage">
        <div className="race-lesson-scene">{children}</div>
        <div className="race-lesson-copy">{explanation}</div>
      </div>
      <div className="race-lesson-actions" role="group" aria-label="Lesson" onKeyDown={onKeyDown}>
        {showBack ? (
          <button type="button" className="ui-button" onClick={onBack}>
            Back
          </button>
        ) : null}
        <button type="button" className="ui-button" onClick={onRestart}>
          Restart the lesson
        </button>
        <button
          type="button"
          className="ui-button ui-button-primary"
          ref={primaryRef}
          onClick={onPrimary}
        >
          {primaryLabel}
        </button>
      </div>
      <button type="button" className="race-lesson-skip" onClick={onSkip}>
        Skip to exploration
      </button>
    </div>
  );
}
