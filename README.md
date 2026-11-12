# Engineering Labs

A public archive of small engineering experiments. One React application, one deployment, and a gallery that grows as labs are added.

**Live site:** https://NicholasLina.github.io/engineering-labs/

## Stack

| Decision | Choice |
| --- | --- |
| Framework | React + TypeScript + Vite |
| Package manager | pnpm |
| Styling | Plain CSS |
| Testing | Vitest + React Testing Library |
| Linting | Oxlint (`pnpm lint`) |
| Hosting | GitHub Pages |
| CI/CD | GitHub Actions |

The current Vite React TypeScript template lints with Oxlint rather than ESLint. `pnpm check` is the quality gate: lint, test, and production build.

## Development

```powershell
pnpm install
pnpm dev
```

Vite is configured with `base: "/engineering-labs/"` so GitHub Pages can serve the project site. Locally, open:

http://localhost:5173/engineering-labs/

```powershell
pnpm test
pnpm test:watch
pnpm build
pnpm check
```

## Add a lab

1. Create a feature branch.
2. Create a folder under `src/labs`, for example `src/labs/async-race-conditions/`.
3. Add a thumbnail SVG in that folder. Give the lab its own theme, and keep the shared card chrome neutral.
4. Implement the experiment with the lab frame below. Shared controls live in `src/ui` and are exported from `src/ui/index.ts`. Colour tokens, including `--accent` and `--lane-1` through `--lane-8`, live in `src/theme.css`. Use those for controls and series so labs stay on one palette.
5. Add focused tests. Frontend labs need at least one meaningful interaction test. Algorithms and other logic need deterministic unit tests and explicit edge cases.
6. Write engineering notes in that folder's `README.md` using the structure below.
7. Add an entry to `src/labs/registry.ts`. Slugs must be unique. Register the component in `src/labs/views.ts` under the same slug.
8. Run `pnpm check`.
9. Commit with a [Conventional Commit](https://www.conventionalcommits.org/) message.
10. Push the branch and merge it into `main`.
11. Confirm the GitHub Actions workflow passes.
12. Confirm the lab appears on the public site.

Every completed lab should give visitors three things: a demo, the source, and engineering notes.

### Lab frame

Every lab uses the same frame. Build it from `LabSplit`, `ScenarioBar`, `ExampleFrame`, and `Explanation` in `src/ui`. Do not restyle those regions in a lab stylesheet. Lab CSS is for the experiment itself.

The stage is four parts, in this order:

1. **Sidebar.** Back link, title, a definition of the concept, then why this example is that situation. Follow with why it matters, how to handle it, and the related issues this example does not cover. `LabSplit` keeps the sidebar resizable.
2. **Scenarios.** A toolbar of the runs that drive the example, including a way to clear the run. Optional controls such as mode or delay stay inside that toolbar under Advanced. Use `ScenarioBar`.
3. **Example.** The thing under test, framed as its own window with room around the content. Use `ExampleFrame`. The window title names the surface the visitor is operating, such as Search.
4. **Explanation.** What the latest run did, then how to read the example and any instruments, then those instruments. Use `Explanation`. The copy changes with the run.

Shared styling for those four parts lives in `src/ui/ui.css`: the sidebar type, the scenario toolbar, the example window, and the explanation panel with its accent rule. A new lab inherits that styling by using the components.

### Gallery card

Every lab plan includes:

- Public title: short, and must not contain the word "lab".
- Summary: one or two sentences for the card.
- Concept tags: two to four short labels for the ideas the lab demonstrates.
- Theme: a concrete visual metaphor plus a thumbnail SVG in the lab folder. The shared card frame, type, and tags stay on the site palette. The picture carries the theme and uses its own colors so it reads in light and dark.

### Engineering notes

```markdown
# Title

## Problem
What real engineering problem are we demonstrating?

## Interactive Demonstration
What can a visitor do?

## Technical Approach
How does the implementation work?

## Trade-offs
What did we choose, and why?

## Validation
What do the tests or measurements demonstrate?

## Production Considerations
What would change in a real production system?
```

### Registry entry

```typescript
import thumbnail from "./async-race-conditions/thumbnail.svg";

{
  slug: "async-race-conditions",
  title: "Race Condition",
  summary: "Show how out-of-order responses overwrite newer results, and how cancellation prevents it.",
  concepts: ["Async", "Cancellation", "Stale responses"],
  thumbnail,
}
```

Place the picture at `src/labs/async-race-conditions/thumbnail.svg`. The gallery reads `src/labs/registry.ts` and opens a registered view from the card link. It renders an empty state until the first lab is registered.
