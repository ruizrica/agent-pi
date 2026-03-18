# Plan: Open Source Prep — Remove Swagbucks & Set Up Dual-Remote Workflow with Guardrails

## Context

The `pi-dev` repo at `github.com/ruizrica/pi-dev` is about to be open-sourced. It currently contains proprietary Swagbucks sentiment analysis tooling — a work-specific skill that must not be public. The Swagbucks footprint spans three areas: (1) a skill directory at `agent/skills/swagbucks/` with 6 files including SKILL.md, reference docs, and templates, (2) two extension files — `agent/extensions/swagbucks-viewer.ts` (the tool + command registration, ~590 lines) and `agent/extensions/lib/swagbucks-viewer-html.ts` (the HTML template generator), and (3) a legacy plan file at `.context/plan-swagbucks-viewer-upgrade.md`.

The repo currently has two remotes: `origin` → `github.com/ruizrica/pi-dev.git` (private) and `prodege` → work fork. The strategy is: keep `origin` as the private repo, add a new `public` remote pointing to a public GitHub repo, create a clean `public` branch with Swagbucks surgically removed, and install guardrails (pre-push hook + CI check) to prevent accidentally pushing private content to the public remote.

**Important nuance:** Only Swagbucks-specific content is private. All other skills (agent-browser, autoresearch, slack-web, way-ios, etc.) and extensions are fine for open source.

| Swagbucks File | Type | Lines (est) |
|---|---|---|
| `agent/skills/swagbucks/` (6 files) | Skill directory | ~600 |
| `agent/extensions/swagbucks-viewer.ts` | Extension (tool + command) | ~590 |
| `agent/extensions/lib/swagbucks-viewer-html.ts` | HTML template lib | ~900+ |
| `.context/plan-swagbucks-viewer-upgrade.md` | Legacy plan | ~100 |

---

## Phase 1: Create the Public Branch (Clean Slate)

**Why:** The public repo needs a clean starting point without any Swagbucks content or its git history. A fresh orphan branch is the simplest and safest approach — no risk of history leaking proprietary content.

- [ ] Create a new branch `public` from current `master`
- [ ] Remove all Swagbucks files from this branch:
  - `agent/skills/swagbucks/` (entire directory)
  - `agent/extensions/swagbucks-viewer.ts`
  - `agent/extensions/lib/swagbucks-viewer-html.ts`
  - `.context/plan-swagbucks-viewer-upgrade.md`
- [ ] Remove all Way (work-specific) skill files from this branch:
  - `agent/skills/way-ios/` (entire directory)
  - `agent/skills/way-simulators/` (entire directory)
- [ ] Remove any Swagbucks references from `.context/session-state.json` and `.context/reports/index.json` if present
- [ ] Verify no remaining references: `grep -ri swagbucks` returns only this plan file (or nothing)
- [ ] Commit as "chore: remove proprietary Swagbucks content for open source release"

---

## Phase 2: Configure Dual-Remote Git Workflow

**Why:** You need to push day-to-day work to `origin` (private) and selectively push the cleaned public branch to a separate public remote. This keeps the workflow simple — `git push` always goes to private, `git push public` is explicit.

- [ ] Keep `origin` as-is (private `pi-dev` repo — your default push target)
- [ ] Create the public GitHub repo (user will do this manually on GitHub)
- [ ] Add `public` remote: `git remote add public https://github.com/ruizrica/<public-repo-name>.git`
- [ ] Push the clean `public` branch: `git push public public:main`
- [ ] Document the workflow in a `CONTRIBUTING.md` or `README` section:
  - `git push` → pushes to private origin (default)
  - `git push public public:main` → pushes to public repo
  - Never push `master` to `public` remote

---

## Phase 3: Install Pre-Push Guardrails

**Why:** Humans make mistakes. A pre-push hook is the last line of defense before proprietary content accidentally reaches the public repo. This hook runs automatically on every `git push` to the `public` remote.

**New file** → `.githooks/pre-push`
- Detect when pushing to the `public` remote
- Scan the branch being pushed for any files matching the private patterns:
  - `agent/skills/swagbucks/**`
  - `agent/extensions/swagbucks-viewer.ts`
  - `agent/extensions/lib/swagbucks-viewer-html.ts`
  - Any file containing "swagbucks" (case-insensitive grep on filenames)
- If any private content is detected, **block the push** with a clear error message
- Allow pushes to other remotes (origin, prodege) without interference

**New file** → `.private-patterns`
- A simple gitignore-style list of patterns that should never appear in the public branch
- Used by both the pre-push hook and CI check
- Easy to extend when new private content is added later

**Modify** → `.gitconfig` (local)
- Set `core.hooksPath = .githooks` so the hook is version-controlled and portable

---

## Phase 4: Add CI Guardrail for Public Repo

**Why:** The pre-push hook only protects your local machine. A GitHub Actions workflow on the public repo provides a second layer — it will fail the build if private content somehow makes it through.

**New file** → `.github/workflows/public-guard.yml`
- Triggers on push and PR to the public repo
- Reads `.private-patterns` and scans all files in the repo
- Fails with a clear error if any private patterns are matched
- Lightweight — just a shell script step, no dependencies

---

## Phase 5: Update .gitignore & Documentation

**Why:** Prevent future private artifacts from leaking and document the dual-repo workflow so future-you (or collaborators) understand the setup.

**Modify** → `.gitignore`
- Add comment section `# Private/proprietary content (never in public repo)`
- Add any Swagbucks-generated artifacts if applicable

**New file** → `OPEN_SOURCE.md` (or section in README)
- Explain the dual-remote setup
- Document how to add new private content (update `.private-patterns`)
- Document the push workflow
- Note that `master` is private-only, `public` branch feeds the public repo

**Modify** → `README.md` (if it exists)
- Add badge or note about the public version
- Link to the open source repo

---

## Phase 6: Verify & Test

**Why:** Trust but verify. Run the full guardrail suite before the public push tonight.

- [ ] Verify `public` branch has zero Swagbucks references
- [ ] Test pre-push hook: attempt `git push public master:main` → should be BLOCKED
- [ ] Test pre-push hook: `git push public public:main` → should SUCCEED (no private content)
- [ ] Test that `git push origin master` still works without interference
- [ ] Verify `.private-patterns` catches all known private paths
- [ ] Do a dry-run of the CI workflow locally (run the same grep/check script)

---

## Critical Files

| File | Action |
|------|--------|
| `agent/skills/swagbucks/` | Delete (entire directory, 6 files) |
| `agent/extensions/swagbucks-viewer.ts` | Delete |
| `agent/extensions/lib/swagbucks-viewer-html.ts` | Delete |
| `.context/plan-swagbucks-viewer-upgrade.md` | Delete |
| `.githooks/pre-push` | New |
| `.private-patterns` | New |
| `.github/workflows/public-guard.yml` | New |
| `OPEN_SOURCE.md` | New |
| `.gitignore` | Modify (add private section) |
| `.git/config` | Modify (add public remote, set hooksPath) |

## Reusable Components (no changes needed)

- **All other skills** (agent-browser, autoresearch, slack-web, etc.) — untouched, safe for open source
- **All other extensions** — no cross-references to Swagbucks in any other extension
- **Core Pi infrastructure** — Swagbucks was cleanly isolated as a standalone extension + skill

## Verification

1. `grep -ri swagbucks agent/` on `public` branch → zero results
2. Pre-push hook blocks: `git push public master:main` → error with clear message
3. Pre-push hook allows: `git push public public:main` → success
4. CI workflow catches private patterns in simulated PR
5. `git push origin master` → works normally (no hook interference)
