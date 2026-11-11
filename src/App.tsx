import { useEffect, useState } from "react";
import { LabCard } from "./labs/LabCard.tsx";
import { labs } from "./labs/registry.ts";
import { labViews } from "./labs/views.ts";

function slugFromHash(): string {
  const value = window.location.hash.replace(/^#/, "");
  if (value === "" || value === "labs") {
    return "";
  }

  return value;
}

export default function App() {
  const [slug, setSlug] = useState(slugFromHash);
  const LabView = labViews[slug];

  useEffect(() => {
    const onHashChange = () => {
      setSlug(slugFromHash());
    };

    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  return (
    <main>
      <h1 className="visually-hidden">Engineering Labs</h1>
      {LabView ? (
        <section aria-label="Open experiment">
          <p className="back-link">
            <a href="#labs">Back to labs</a>
          </p>
          <LabView />
        </section>
      ) : (
        <section id="labs" aria-label="Experiments">
          {labs.length === 0 ? (
            <p>Experiments coming soon.</p>
          ) : (
            <ul className="lab-gallery">
              {labs.map((lab) => (
                <LabCard key={lab.slug} lab={lab} />
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
