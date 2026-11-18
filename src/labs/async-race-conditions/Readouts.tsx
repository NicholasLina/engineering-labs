import type { ReactNode } from "react";

export type Readout = {
  label: string;
  value: string;
  /** Draws the lamp's colour beside the value. */
  signal?: "awaiting" | "amber" | "blue" | "dark";
  /** `quiet` is a value that is not set yet. `alert` is one that disagrees with its neighbour. */
  tone?: "quiet" | "alert";
  /** Why the value is an alert. Pass an empty string to keep its place while there is nothing to say. */
  note?: string;
};

/** The row of facts under a scene: what was asked for, and what is showing. */
export function Readouts({
  items,
  children,
}: {
  items: readonly Readout[];
  children?: ReactNode;
}) {
  return (
    <div className="race-readouts">
      {items.map((item) => (
        <p
          key={item.label}
          className="race-readout"
          data-signal={item.signal}
          data-tone={item.tone ?? "plain"}
        >
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          {item.note === undefined ? null : <em>{item.note}</em>}
        </p>
      ))}
      {children}
    </div>
  );
}
