import { TooltipButton } from "./TooltipButton.tsx";

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  tip: string;
  tipId: string;
};

export function SegmentedControl<T extends string>({
  label,
  labelId,
  value,
  options,
  onChange,
}: {
  label: string;
  labelId: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="ui-tool">
      <span className="ui-tool-label" id={labelId}>
        {label}
      </span>
      <div className="ui-segment" role="group" aria-labelledby={labelId}>
        {options.map((option) => (
          <TooltipButton
            key={option.value}
            label={option.label}
            tip={option.tip}
            tipId={option.tipId}
            pressed={option.value === value}
            onClick={() => {
              onChange(option.value);
            }}
          />
        ))}
      </div>
    </div>
  );
}
