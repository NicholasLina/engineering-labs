import type { Lab } from "./registry.ts";

export function LabCard({ lab }: { lab: Lab }) {
  return (
    <li className="lab-card">
      <img src={lab.thumbnail} alt="" />
      <h2>
        <a href={`#${lab.slug}`}>{lab.title}</a>
      </h2>
      <p>{lab.summary}</p>
      <ul className="lab-tags" aria-label="Concepts">
        {lab.concepts.map((concept) => (
          <li key={concept}>{concept}</li>
        ))}
      </ul>
    </li>
  );
}
