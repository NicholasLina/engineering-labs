import { labs } from "./labs/registry.ts";

export default function App() {
  return (
    <main>
      <header>
        <p>Software Engineering Portfolio</p>
        <h1>Engineering Labs</h1>
        <p>
          Interactive experiments exploring software reliability, performance,
          accessibility, and system design.
        </p>
      </header>

      <section aria-label="Experiments">
        {labs.length === 0 ? (
          <p>Experiments coming soon.</p>
        ) : (
          <ul>
            {labs.map((lab) => (
              <li key={lab.slug}>
                <h2>{lab.title}</h2>
                <p>{lab.summary}</p>
                <p>{lab.skills.join(" · ")}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
