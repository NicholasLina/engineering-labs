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
3. Implement the experiment.
4. Add focused tests. Frontend labs need at least one meaningful interaction test. Algorithms and other logic need deterministic unit tests and explicit edge cases.
5. Write engineering notes in that folder's `README.md` using the structure below.
6. Add an entry to `src/labs/registry.ts`. Slugs must be unique.
7. Run `pnpm check`.
8. Commit with a [Conventional Commit](https://www.conventionalcommits.org/) message.
9. Push the branch and merge it into `main`.
10. Confirm the GitHub Actions workflow passes.
11. Confirm the lab appears on the public site.

Every completed lab should give visitors three things: a demo, the source, and engineering notes.

### Engineering notes

```markdown
# Lab Title

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
{
  slug: "async-race-conditions",
  title: "Async Race Conditions",
  summary: "Show how out-of-order responses overwrite newer results, and how cancellation prevents it.",
  skills: ["React", "Async", "Testing"],
}
```

The gallery reads `src/labs/registry.ts`. It renders an empty state until the first lab is registered.
