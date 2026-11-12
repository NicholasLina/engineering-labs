import type { ReactNode } from "react";

export type ExplanationNote = {
  term: string;
  detail: string;
};

export function Explanation({
  titleId,
  happened,
  readout,
  children,
}: {
  titleId: string;
  happened: ReactNode;
  readout: readonly ExplanationNote[];
  children?: ReactNode;
}) {
  return (
    <section className="lab-explanation" aria-labelledby={titleId}>
      <h3 id={titleId}>Explanation</h3>
      <div className="lab-brief">
        <p>{happened}</p>
        <dl className="lab-readout">
          {readout.map((note) => (
            <div key={note.term}>
              <dt>{note.term}</dt>
              <dd>{note.detail}</dd>
            </div>
          ))}
        </dl>
      </div>
      {children}
    </section>
  );
}
