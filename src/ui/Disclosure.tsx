import { useState, type ReactNode } from "react";

export function Disclosure({
  label,
  panelId,
  children,
}: {
  label: string;
  panelId: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="ui-disclosure">
      <button
        type="button"
        className="ui-disclosure-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        {label}
      </button>
      <div id={panelId} hidden={!open}>
        {children}
      </div>
    </div>
  );
}
