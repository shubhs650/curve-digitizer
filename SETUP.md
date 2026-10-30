# Setup: GitHub repo + Claude Code project (autodrive)

This file is for you, not for the agents. Delete it (or move it to `docs/internal/`) once the project is running. Steps take about 30 minutes total.

## 1. Create the GitHub repository (≈5 min)

1. On GitHub: **New repository** → name `curve-digitizer`, owner = your account or the OET org, **Private** (per decision #21; flip to public after M1), no README/.gitignore/license (we bring our own).
2. On your machine:
   ```bash
   unzip curve-digitizer-kit.zip -d curve-digitizer
   cd curve-digitizer
   git init -b main
   git add -A
   git commit -m "chore: kickoff docs, CLAUDE.md, CI, templates"
   git remote add origin git@github.com:<owner>/curve-digitizer.git
   git push -u origin main
   ```
3. **Settings → General → Pull Requests:** tick *Allow squash merging* only; tick *Automatically delete head branches*.
4. **Settings → Branches → Add branch ruleset** for `main`: *Require a pull request before merging*, *Require status checks to pass* (add `check` and the three `e2e` jobs once CI has run once), *Block force pushes*. Do **not** require reviews — that would stall autodrive; you review by reading PRs when you have time, and CI is the gate.
5. **Settings → Actions → General:** *Allow all actions*; Workflow permissions: *Read and write* (needed for auto-fix pushes).
6. **Labels:** create `M0`, `M1`, `M2`, `M3`, `decision`, `bug`, `enhancement`. (Or let the first thread do it — see Prompt 0.)
7. CI minutes: the private-repo quota goes fast with three e2e browsers. Either flip to public after M1, or edit `.github/workflows/ci.yml` `runs-on` to your RunsOn label. For M0 you can also temporarily set the e2e matrix to `[chromium]`.

## 2. Connect GitHub to Claude Code (≈5 min, once per account)

1. Go to https://claude.ai/code. If it's your first visit it walks you through connecting GitHub.
2. Install the **Claude GitHub App** (https://github.com/apps/claude) and grant it the `curve-digitizer` repository (or the whole OET org). Projects require the app; the `/web-setup` terminal token alone is not enough.
3. If the repo lives in an org with SAML SSO, reconnect GitHub and authorise the Claude app for that org.

## 3. Create the Claude Code project (≈10 min)

Projects are in beta on Pro/Max. In the left sidebar at claude.ai/code (or under **More**) choose **Projects → New project**.

- **Name:** Curve Digitizer
- **Goal:** Ship Curve Digitizer rev 0 (M1 → M2 → M3) per docs/MILESTONES.md with all acceptance targets green.
- **Context:** Add the `curve-digitizer` repository.

Click **Create project**. On a first project Claude may post *Setup recommendations*; ignore or accept, it doesn't matter.

### 3a. Project instructions
Gear icon → **Project settings → Memory → Project instructions**. Paste the block from `docs/AUTODRIVE_PROMPTS.md` §A verbatim (it is under the 16 000-character limit).

### 3b. Models and effort
**Project settings → General:**
- Thread model: Opus; Thread effort: high (defaults — keep for M0 and the algorithm tasks 2.3, 3.1). Switch threads to Sonnet for pure UI tasks if you watch usage.
- Coordinator model: Opus, effort low (default).

### 3c. Environment
**Project settings → Environment:** the default Anthropic environment reaches the npm registry, so nothing is required for M0. Add a setup script only if a thread reports a missing tool (Playwright browsers install themselves via `pnpm exec playwright install --with-deps`). No secrets are needed — there are none in this project.

### 3d. Plugins / connectors
None required. Optionally add a code-intelligence plugin for TypeScript under **Project settings → Plugins**.

## 4. Kick off (≈5 min)

Paste **Prompt 0** from `docs/AUTODRIVE_PROMPTS.md` into the project conversation. It starts the M0 scaffold as a single thread and tells Claude how to run the rest unattended.

When M0's PR is green, merge it (one click on the thread card: **Merge it**), then paste **Prompt M1**. Repeat for M2 and M3. Each milestone prompt tells the coordinator to fan out threads per `docs/MILESTONES.md`, respect dependencies, and run at most 3 at a time.

## 5. Your weekly 20 minutes

- Open the project → **Overview → Waiting on you**. Answer anything there (usually a permission prompt or a `decision:` issue the thread already resolved and is just informing you about).
- **Overview → Ready for review**: skim the PR description (it has test and size summaries). If CI is green and the description makes sense, click **Merge it**. If something looks wrong, type the correction into *that thread's* message box, and add "remember this" so it lands in project memory.
- Once per milestone: run the manual acceptance items (U1 with two colleagues, U2, P7) and paste results into the release thread.

## 6. Pitfalls specific to cloud threads

- Threads load `CLAUDE.md` and `.claude/rules/` from the repo, but **not** `.claude/settings.json`, hooks, skills or `.mcp.json`. Everything agents must follow is therefore in `CLAUDE.md`, the rules files, and project instructions — keep them in sync.
- Threads run in auto mode; a thread that still asks for a permission is waiting in its own transcript, not in the conversation.
- Sandboxes can be lost between turns; `CLAUDE.md` tells threads to push every 30 minutes. If a thread "lost" work, tell it to continue from its branch.
- A thread that reaches your plan limit waits and resumes automatically; expect a burst of PRs after resets.
- Don't start M1 threads before M0 is merged: they'd all re-scaffold the repo differently.

## 7. Going public (after M1)

**Settings → General → Danger zone → Change visibility → Public.** Then: enable Discussions (optional), add the repo link to the app header config, update `docs/DECISIONS.md` #21 with the date.
