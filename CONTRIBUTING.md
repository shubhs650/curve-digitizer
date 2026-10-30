# Contributing

Thanks for helping. This project is small, opinionated, and test-gated; please read `CLAUDE.md` first — it is written for AI agents but every rule applies to humans too.

## Before you start
- Check `docs/MILESTONES.md` and open issues. Pick a task or open an issue describing what you intend to do.
- Rev 0 scope is fixed by `docs/PRD.md` §5. Rev 1 ideas go to `docs/ROADMAP.md` via an issue, not a PR.

## Workflow
1. Fork/branch from `main`: `feat/<milestone>-<task>-<slug>`, `fix/<slug>`, `docs/<slug>`.
2. Write the failing test first.
3. `pnpm check` must be green locally.
4. Open a PR using the template. One task per PR. Keep PRs under ~600 changed lines where possible.
5. CI must pass. A maintainer reviews within a few days.

## Rules that get a PR rejected
- Any network call other than to the app's own origin.
- Analytics, cookies, telemetry of any kind.
- A dependency that is not MIT/BSD/Apache-compatible.
- Direct mutation of the project model outside the command pattern.
- Changed `samples/` ground truth without an ADR entry.
- Schema change without migration + fixture.

## Samples and ground truth
Samples under `samples/` are synthetic (generated from SVG) so ground truth is exact. To add one, add the generator to `scripts/gen-samples.py`, regenerate, and commit the outputs.

## Code of conduct
Be kind and specific. Technical disagreement is welcome; personal remarks are not.
