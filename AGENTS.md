# Engineering Labs — Agent Instructions

## Purpose
Build small engineering experiments that demonstrate clear reasoning,
observable behavior, meaningful validation, and explicit trade-offs.
Keep each lab within its agreed scope.

## Before implementation
- Read the repository README and relevant existing code.
- Inspect git status; preserve unrelated work.
- Work on a feature branch.
- Present the problem, scope, non-goals, acceptance criteria,
  technical approach, alternatives, and validation strategy.
- Propose logical implementation stages and commit messages.
- Wait for approval of the plan before implementing.

## Implementation and commits
- Implement, validate, review, and commit one stage at a time.
- Complete the current stage before starting the next.
- Keep each commit focused and independently working.
- Include tests with the behavior they validate.
- Run pnpm check before each implementation commit.
- Inspect the staged diff; stage only intended files.
- Use Conventional Commits with a meaningful lab scope.
- Explain non-obvious decisions in the commit body.
- Record validation accurately; distinguish measured results
  from expectations.
- Update the plan when evidence requires a change.

## Completion
- Document the problem, approach, trade-offs, validation,
  and production considerations.
- Verify acceptance criteria and review the complete branch diff.
- Report commits, checks, remaining limitations, and demo instructions.
- Pause for user review before pushing or merging.
