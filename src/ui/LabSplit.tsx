import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

const defaultRem = 22;
const minRem = 16;
const maxRem = 40;

function clamp(width: number) {
  return Math.min(maxRem, Math.max(minRem, width));
}

export function LabSplit({
  className,
  labelledBy,
  sidebar,
  children,
}: {
  className?: string;
  labelledBy?: string;
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const [sidebarRem, setSidebarRem] = useState(defaultRem);
  const dragOrigin = useRef<{ x: number; width: number } | null>(null);
  const style = { "--lab-sidebar-width": `${sidebarRem}rem` } as CSSProperties;

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    dragOrigin.current = { x: event.clientX, width: sidebarRem };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Window listeners still follow the drag when capture is unavailable.
    }

    const move = (moveEvent: globalThis.PointerEvent) => {
      const origin = dragOrigin.current;
      if (!origin) {
        return;
      }

      const rootFont = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
      const rem = Number.isFinite(rootFont) && rootFont > 0 ? rootFont : 16;
      setSidebarRem(clamp(origin.width + (moveEvent.clientX - origin.x) / rem));
    };
    const up = () => {
      dragOrigin.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
      return;
    }

    event.preventDefault();
    setSidebarRem((width) => clamp(width + (event.key === "ArrowRight" ? 1 : -1)));
  }

  return (
    <section className={className ? `lab-split ${className}` : "lab-split"} style={style} aria-labelledby={labelledBy}>
      <aside className="lab-split-sidebar">{sidebar}</aside>
      <div
        className="lab-split-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Sidebar width"
        aria-valuemin={minRem}
        aria-valuemax={maxRem}
        aria-valuenow={Math.round(sidebarRem)}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
      />
      <div className="lab-split-stage">{children}</div>
    </section>
  );
}
