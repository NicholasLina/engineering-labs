export function SwitchControl({
  label,
  checked,
  tip,
  tipId,
  onChange,
}: {
  label: string;
  checked: boolean;
  tip: string;
  tipId: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <span className="ui-tip">
      <button
        type="button"
        className="ui-switch"
        role="switch"
        aria-checked={checked}
        aria-describedby={tipId}
        onClick={() => {
          onChange(!checked);
        }}
      >
        <span className="ui-switch-track" aria-hidden="true">
          <span className="ui-switch-thumb" />
        </span>
        {label}
      </button>
      <span className="ui-tip-text" id={tipId} role="tooltip">
        {tip}
      </span>
    </span>
  );
}
