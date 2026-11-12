import type { ReactNode } from "react";
import { Disclosure } from "./Disclosure.tsx";

export function ScenarioBar({
  labelId,
  advanced,
  advancedPanelId = "lab-advanced-panel",
  children,
}: {
  labelId: string;
  advanced?: ReactNode;
  advancedPanelId?: string;
  children: ReactNode;
}) {
  return (
    <div className="lab-scenarios">
      <div className="ui-toolbar" role="toolbar" aria-label="Scenarios">
        <div className="ui-tool">
          <span className="ui-tool-label" id={labelId}>
            Scenarios
          </span>
          <div role="group" aria-labelledby={labelId}>
            {children}
          </div>
        </div>
        {advanced ? (
          <Disclosure label="Advanced" panelId={advancedPanelId}>
            <div className="ui-toolbar ui-toolbar-plain">{advanced}</div>
          </Disclosure>
        ) : null}
      </div>
    </div>
  );
}
