# Autodrive prompts

Copy-paste material for the Claude Code project. §A goes into **Project settings → Memory → Project instructions** once. §B are the messages you send into the project conversation, one per milestone. §C are spare prompts for when something goes sideways.

---

## A. Project instructions (paste once)

```text
This project builds Curve Digitizer: a PDF-first, fully in-browser graph digitizer for engineers (curve-digitizer.openengtools.com), MIT, part of Open Engineering Tools. The repository is curve-digitizer. I have other priorities and will check in roughly once a week; run this project with minimal human input.

Source of truth, in order: CLAUDE.md, docs/PRD.md, docs/ARCHITECTURE.md, docs/PROJECT_SCHEMA.md, docs/MILESTONES.md, docs/ACCEPTANCE_TARGETS.md, docs/DECISIONS.md. Threads read all of them before writing code. Non-goals in PRD §5 are binding.

How to run the work
- Work milestone by milestone: M0 → M1 → M2 → M3. Do not start a milestone until the previous milestone's release PR is merged on main.
- Within a milestone, start one thread per task in docs/MILESTONES.md, in dependency order. Run at most 3 threads at a time. Start threads without asking me to confirm.
- Each thread: branch feat/<milestone>-<task>-<slug> from main, one task, TDD, pnpm check green, open a normal PR with the template, watch CI and fix it. Commit and push at least every 30 minutes.
- When a thread's PR is green, post one line in the conversation: task, PR link, test and size summary. Do not wait for me to merge before starting the next dependency-free task; if a later task depends on an unmerged PR, branch from that PR's branch and say so in the PR description.
- Merge policy: you may merge a PR yourself (squash) when CI is green AND the task is not in the "human merge" list below. Human merge list: 0.1 (scaffold), 1.12 / 2.8 / 3.8 (releases), any PR that changes docs/PROJECT_SCHEMA.md, docs/DECISIONS.md, the license, CI secrets or workflows, or adds a dependency. For those, leave the PR open under Ready for review and continue with other work.
- Decisions: if docs/DECISIONS.md doesn't cover something that materially affects architecture, schema or scope, open a GitHub issue "decision: …" with options and a recommendation, record the recommendation as a new ADR row, and proceed. Only stop for irreversible decisions (incompatible file-format change, deleting data, dependency with unclear license).
- Blockers: if something needed is unreachable (registry, tool, file), say exactly what is missing in the thread's first message and stop that thread; don't mock or substitute. Post the blocker in the conversation.
- Scope: never widen a task. New ideas → GitHub issue labelled enhancement, referencing docs/ROADMAP.md.
- Memory: when I correct something, remember it. Record pitfalls you discover (flaky tests, EmbedPDF quirks, Playwright issues) in project memory so later threads don't repeat them.
- Updates: post only when a PR is ready, a milestone is complete, or something is blocked. At milestone completion post a short status with: merged PRs, acceptance targets passed/failed, open issues, what I need to do manually (U1, U2, P7 items).
- Safety rails: never force-push main, never change CI secrets, never add telemetry or network calls, never change the license, never modify samples/ ground truth without an ADR.
- Quality bar: a PR without tests is not done. Accuracy and performance targets are checked against samples/; if a target fails, the thread keeps working on it rather than lowering the target. If after a serious attempt a target seems unattainable, open a "decision:" issue with evidence and recommend a revised target; do not silently relax it.
```

---

## B. Milestone kickoff prompts (send into the project conversation)

### Prompt 0 — Scaffold (M0)

```text
Start M0 from docs/MILESTONES.md.

First, a single thread for task 0.1 only: pnpm monorepo per docs/ARCHITECTURE.md §3 (apps/web, packages/core, math, image, trace, fit, export, pdf, workers — empty packages with index.ts and one passing test each), TypeScript strict, ESLint + Prettier, Vitest, Playwright (chromium only for now), the scripts listed in CLAUDE.md including `pnpm check` and `pnpm size` (size budget script with the numbers from ARCHITECTURE §9), and make .github/workflows/ci.yml green. Add GitHub labels M0 M1 M2 M3 decision bug enhancement if they don't exist. Do not add any application code yet. Open the PR and leave it for me to merge (it is on the human-merge list). Tell me when it's green.

As soon as I've merged 0.1, start 0.2, 0.3, 0.4 and 0.5 as parallel threads (max 3 at a time, queue the rest), then 0.6 and 0.7. Merge those yourself when green per the project instructions. When M0 is complete, post the milestone status and stop; I'll send the M1 prompt.
```

### Prompt M1 — Manual core

```text
M0 is merged. Start M1 from docs/MILESTONES.md following the parallelism guide: 1.1, 1.2, 1.5, 1.7, 1.9 first (max 3 at a time), then 1.3, 1.4, 1.8, then 1.6, 1.10, 1.11, then 1.12.

Notes for threads:
- 1.3 and 1.4 are the heart of M1; accuracy targets A1 and A2 must pass on samples/vector-clean and samples/sn-family before the PR opens.
- 1.7 must prove R5 (image-only fallback) and P2 (PDFium chunk not requested until first PDF open) with e2e tests, and must keep PDF bytes in OPFS.
- 1.11 writes docs/content pages: getting-started, calibration, manual-digitizing, exporting, project-files. Plain language, screenshots can be placeholders.
- 1.12 (release): bump to 0.1.0, CHANGELOG, Cloudflare Pages config, run the full acceptance list for M1 and report pass/fail per ID, and list the manual items (U1, U2, P7) for me. Leave the release PR for me to merge.

Post the milestone status when done and stop; I'll send the M2 prompt after I've run the manual checks.
```

### Prompt M2 — Smart tracing

```text
M1 is released. Start M2 from docs/MILESTONES.md: 2.1 first (alone), then 2.2, 2.3, 2.5 in parallel (max 3), then 2.4, 2.6, 2.7, then 2.8.

Notes for threads:
- 2.3 (guided tracer) is the hardest task in the project. Implement exactly the cost-map corridor search in ARCHITECTURE §8.1, with every parameter exposed in a typed options object. It must pass A3, A4 and P4 on the samples before the PR opens. If a target fails after a serious attempt, open a "decision:" issue with measured numbers and the best alternative you found; do not lower the target silently. Write a short docs/content/how-tracing-works.md explaining the algorithm to users.
- 2.1: every filter is a pure function on ImageData with a benchmark; grid suppression must not erase curve segments that happen to be horizontal (test for it on samples/sn-family).
- 2.7: uncertainty must appear in the data table and in CSV/XLSX exports (new column), and A9 must pass.
- 2.8: version 0.2.0, CHANGELOG, acceptance report per ID, manual items for me, release PR left for me.

Post the milestone status when done and stop.
```

### Prompt M3 — Fitting and extras

```text
M2 is released. Start M3 from docs/MILESTONES.md: 3.1 first (alone), then 3.2, 3.3, 3.5, 3.6, 3.7 in parallel (max 3), then 3.4, then 3.8.

Notes for threads:
- 3.1: fits computed in axis space (log for log axes); AICc ranking; A7 must pass on synthetic fixtures generated by scripts/gen-fixtures.py (extend it; compare against scipy.optimize / numpy.polyfit values).
- 3.3: six code generators driven by the model registry; A8 verified by actually executing Python (via a CI step) and JS snippets at 50 X values; Excel formula verified with a formula evaluator; VBA/MATLAB/C by golden files.
- 3.4: Fit sheet with named ranges and working formulas (open the produced .xlsx with ExcelJS or a Python reader in tests and recompute a few cells); embedded chart and crop image; P6.
- 3.7: the error reporter must never send anything automatically; e2e asserts no network request leaves the origin.
- 3.8: samples as one-click demo projects on the home screen; docs complete including the roadmap page; version 0.3.0; acceptance report for the full rev 0 list; release PR left for me. Also prepare a PUBLIC-RELEASE.md checklist for making the repo public (README polish, screenshots, issue labels, discussions).

Post the final status when done and stop.
```

---

## C. Spare prompts

**Status check**
```text
For every open thread, list what you asked it to do, what it assumed or couldn't reach, and what it's waiting on. Then list PRs ready for review with one-line summaries.
```

**A thread went off-scope**
```text
Thread <name> is building something outside its task. Stop it, revert anything outside the task scope on its branch, keep the in-scope work, and remember: tasks are bounded by docs/MILESTONES.md; extra ideas become issues.
```

**Usage is burning too fast**
```text
Run at most 1 thread at a time until the next reset, use Sonnet for UI-only tasks (1.5, 1.6, 1.11, 2.2, 3.5, 3.6, 3.7), keep Opus for 1.3, 1.4, 1.7, 2.1, 2.3, 3.1, 3.3. Remember this.
```

**Correction to remember**
```text
Correction for all future threads: <the correction>. Remember this in project memory and update CLAUDE.md in a small PR if it belongs there.
```

**Lost sandbox**
```text
Thread <name> lost its sandbox. Start a new thread for the same task, continue from branch <branch>, and finish it.
```

**Post-M1: go public**
```text
I've made the repository public. Open a small PR that updates docs/DECISIONS.md #21 with today's date, adds the GitHub link to the app header config, and polishes README.md with two screenshots from the samples (generate them with Playwright).
```
