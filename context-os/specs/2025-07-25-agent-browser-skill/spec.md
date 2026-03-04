# Spec: agent-browser Skill

**Date:** 2025-07-25
**Status:** Draft
**Spec Folder:** `context-os/specs/2025-07-25-agent-browser-skill/`

---

## Goal

Install the `agent-browser` skill globally so Pi can autonomously use the `agent-browser` CLI for webpage testing, web searching, and browser automation tasks. The skill should work immediately by dropping it into the global skills folder -- zero configuration required.

## User Stories

1. **As a developer**, I want Pi to automatically know how to use `agent-browser` when I ask it to test a webpage, so I don't have to explain the CLI every time.
2. **As a developer**, I want Pi to be able to search the web by navigating to search engines and extracting results, using the browser skill.
3. **As a developer**, I want Pi to handle complex browser automation (form filling, authentication, screenshots, data extraction) without me providing step-by-step instructions.
4. **As a developer**, I want the skill to stay up-to-date automatically when I update the `agent-browser` npm package.

## Requirements

### 1. Symlink Bundled Skill to Global Skills Directory

**What:** Create `~/.pi/agent/skills/agent-browser/` as a symlink pointing to the bundled skill directory in the agent-browser npm package.

**Source:** `/Users/ricardo/.nvm/versions/node/v20.19.5/lib/node_modules/agent-browser/skills/agent-browser/`
**Target:** `~/.pi/agent/skills/agent-browser`

**Why symlink:** When `agent-browser` is updated via `npm update -g agent-browser`, the skill content updates automatically. No manual sync needed.

**Contents included via symlink:**
- `SKILL.md` -- Full skill instructions with frontmatter
- `references/` -- 6 deep-dive docs (commands, snapshot-refs, session-management, authentication, video-recording, proxy-support)
- `templates/` -- 3 ready-to-use shell scripts (form-automation, authenticated-session, capture-workflow)

### 2. Install Playwright Browser Binaries

**What:** Run `agent-browser install` to download and install Chromium headless shell.

**Why:** The CLI depends on Playwright's Chromium binary. Without it, all commands fail with "Executable doesn't exist" error.

### 3. Add Web Search Workflow Reference

**What:** Create an additional reference document `references/web-search.md` in the skill directory that teaches the agent how to perform web searches.

**Note:** Since we're symlinking, this file should be added to a local overlay or we should copy instead. **Decision:** We will add a `web-search.md` reference document. Since modifying the symlinked npm package is fragile, we have two options:
- **Option A:** Copy the skill instead of symlinking, then add the file (loses auto-update)
- **Option B:** Symlink the skill AND add a supplementary skill or reference at project level

**Chosen approach:** Copy the bundled skill to `~/.pi/agent/skills/agent-browser/` and add the web search reference. The search workflow is a one-time addition and the core skill rarely changes drastically between versions.

### 4. Verify Skill Discovery

**What:** Confirm Pi discovers and loads the skill from `~/.pi/agent/skills/agent-browser/`.

**How:** Pi auto-discovers skills from `~/.pi/agent/skills/` per the skills documentation. The directory name `agent-browser` matches the `name: agent-browser` in SKILL.md frontmatter.

### 5. Setup Script

**What:** Create an idempotent setup script at `context-os/specs/2025-07-25-agent-browser-skill/implementation/setup.sh` that:
1. Checks if `agent-browser` CLI is installed
2. Runs `agent-browser install` for browser binaries
3. Copies the bundled skill to `~/.pi/agent/skills/agent-browser/`
4. Adds the web search reference document
5. Verifies the installation

## Visual Design

N/A -- This is a CLI skill, no UI components.

## Existing Code to Leverage

| Asset | Path | Notes |
|-------|------|-------|
| Bundled SKILL.md | `$(npm root -g)/agent-browser/skills/agent-browser/SKILL.md` | Complete, production-ready |
| 6 reference docs | `$(npm root -g)/agent-browser/skills/agent-browser/references/` | commands, snapshots, sessions, auth, video, proxy |
| 3 template scripts | `$(npm root -g)/agent-browser/skills/agent-browser/templates/` | form, auth, capture workflows |
| Pi skills discovery | `~/.pi/agent/skills/` | Auto-scanned on startup |

## Out of Scope

- Rewriting the bundled SKILL.md (it's already comprehensive)
- Cloudflare worker-based web testing (separate extension)
- Building or modifying the agent-browser CLI itself
- Installing the skill-creator companion skill
- Project-local skill installation (going global only)
- iOS testing setup (requires Xcode + Appium -- documented but not auto-installed)

## Implementation Plan

1. **Create setup script** -- idempotent bash script
2. **Write web-search.md** -- search engine workflow reference
3. **Run setup** -- execute the script
4. **Verify** -- confirm skill loads in Pi

## Acceptance Criteria

- [ ] `~/.pi/agent/skills/agent-browser/SKILL.md` exists with valid frontmatter
- [ ] `~/.pi/agent/skills/agent-browser/references/` contains 7 files (6 bundled + web-search.md)
- [ ] `~/.pi/agent/skills/agent-browser/templates/` contains 3 shell scripts
- [ ] `agent-browser install` has been run successfully (Chromium binary exists)
- [ ] Pi discovers the skill (skill name appears in agent context)
- [ ] Agent can be asked to "search the web for X" and knows to use agent-browser
