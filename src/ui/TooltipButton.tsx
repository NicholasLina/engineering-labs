export function TooltipButton({
  label,
  tip,
  tipId,
  pressed,
  variant = "default",
  onClick,
}: {
  label: string;
  tip: string;
  tipId: string;
  pressed?: boolean;
  variant?: "default" | "primary" | "outline";
  onClick: () => void;
}) {
  const className =
    variant === "primary"
      ? "ui-button ui-button-primary"
      : variant === "outline"
        ? "ui-button ui-button-outline"
        : "ui-button";

  return (
    <span className="ui-tip">
      <button
        type="button"
        className={className}
        aria-describedby={tipId}
        aria-pressed={pressed}
        onClick={onClick}
      >
        {label}
      </button>
      <span className="ui-tip-text" id={tipId} role="tooltip">
        {tip}
      </span>
    </span>
  );
}
