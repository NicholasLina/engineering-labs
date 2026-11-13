import type { ReactNode } from "react";

export function ExampleFrame({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <section className="lab-example" aria-label="Example">
      <div className="lab-example-bar">{label}</div>
      <div className="lab-example-body">{children}</div>
    </section>
  );
}
