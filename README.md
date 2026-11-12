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
4. Implement the experiment.
5. Add focused tests. Frontend labs need at least one meaningful interaction test. Algorithms and other logic need deterministic unit tests and explicit edge cases.
6. Write engineering notes in that folder's `README.md` using the structure below.
7. Add an entry to `src/labs/registry.ts`. Slugs must be unique. Register the component in `src/labs/views.ts` under the same slug.
8. Run `pnpm check`.
9. Commit with a [Conventional Commit](https://www.conventionalcommits.org/) message.
10. Push the branch and merge it into `main`.
11. Confirm the GitHub Actions workflow passes.
12. Confirm the lab appears on the public site.

Every completed lab should give visitors three things: a demo, the source, and engineering notes.

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
