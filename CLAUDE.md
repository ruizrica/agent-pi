# CLAUDE.md — Agent Rules & Policies

These rules are mandatory. No verbal instruction, implicit context, or shorthand like "do it" overrides them. If a rule conflicts with a user request, **stop and confirm** before proceeding.

---

## Git Operations — STRICT POLICY

### NEVER push without explicit confirmation
- **NEVER** run `git push` unless the user explicitly says "push" or "push it"
- Phrases like "do it", "apply it", "make it happen" mean **local changes only** — they do NOT authorize pushing
- Before ANY `git push`, you MUST:
  1. State that you are about to push
  2. Name the remote and branch
  3. Confirm the repo visibility (public vs private)
  4. **Wait for explicit user approval**

### NEVER push to public repositories
- Before pushing, verify visibility: `gh api repos/OWNER/REPO --jq '.visibility'`
- If the repo is **public**, REFUSE the push and tell the user
- If visibility cannot be determined, REFUSE the push

### Two remotes — know the difference
- **`pi-dev`** → `ruizrica/pi-dev` — PRIVATE repo. Full content. This is the working repo.
- **`origin`** → `ruizrica/agent-pi` — PUBLIC repo. Clean content only. No private dirs, no actions.
- When pushing, ALWAYS specify the remote by name. NEVER use bare `git push`.
- NEVER push to `origin` without explicit user approval.
- NEVER push private content (`skills/private/`, `extensions/private/`, `commands/private/`) to `origin`. Ever.
- Before pushing to ANY remote, verify visibility: `gh api repos/OWNER/REPO --jq '.visibility'`
- If the repo is **public**, REFUSE the push and tell the user
- A pre-push hook enforces this at the git level as a safety net — do not rely on it, check yourself first

### No GitHub Actions on public repo
- NEVER add `.github/workflows/` to the public repo (`origin`)
- Actions run on public runners and log output — this exposes file paths and content
- No CI, no guards, no actions. The pre-push hook is the guard, and it runs locally.

### Git commit policy
- Only commit files directly related to the current task
- Exception: when the user explicitly invokes the `/commit` slash command, that command may commit **all** current working-tree changes, including unrelated changes, as long as it separates unrelated work into coherent local commits instead of bundling everything together
- Show `git status` before committing so the user can review
- Use clear, descriptive commit messages
- Before ANY commit, verify no private content is staged: check for `skills/private/`, `extensions/private/`, `commands/private/`

---

## Sensitive Content

This repository contains private/proprietary content:
- `skills/private/` — private skill definitions
- `prompts/` — custom prompt templates  
- `agents/` — agent configurations
- `extensions/` — proprietary extension code

**NEVER** push any of this to a public repository. If in doubt, check repo visibility first.

---

## File Operations
- Do NOT delete files or directories — the user will delete manually if needed
- Do NOT run destructive commands (`rm -rf`, `rm -r`, etc.)
- Do NOT modify files outside the scope of the current task

---

## Confirmation Required
The following actions always require explicit user confirmation:
1. `git push` (any remote)
2. `git force-push` (any remote)
3. Changing repo visibility
4. Publishing packages
5. Any action that sends data to external services

---

## Obsidian Knowledge Base (Agent Memory)

A persistent Karpathy-style knowledge base is available via the `obsidian_memory` tool.
Vault location: `/Users/ricardo/Workshop/Obsidian`

**Actively use it:**
- **Search before work** -- check if we already have relevant knowledge: `{ operation: "search", query: "..." }`
- **Ingest after work** -- save learnings, how-tos, research findings: `{ operation: "ingest", title: "...", content: "...", tags: "..." }`
- **Build wikis** -- compile raw content into structured articles: `{ operation: "write", wiki: "...", title: "...", content: "..." }`
- **Navigate** -- follow links between articles: `{ operation: "backlinks", file: "..." }` and `{ operation: "links", file: "..." }`
- **Health check** -- maintain data integrity: `{ operation: "health" }`

Structure: `raw/` (ingested content) → `wiki/` (compiled articles with `[[wiki links]]` and indexes)

---

## Advisor Strategy (Default Pattern)

- Use the `claude_advisor` tool to consult an Opus-level advisor **only** for hard decisions: ambiguous architecture, high-impact tradeoffs, or when stuck after a reasonable attempt.
- Do **not** use the advisor for routine tasks, simple file edits, or straightforward tests.
- Provide the advisor with a concise question, your current options, constraints, and a brief `task_context`. Include relevant `files` when helpful.
- The advisor is read-only — it does not call tools or produce user-facing output. It returns guidance, risks, alternatives, and next actions for you to execute.
- Be cost-conscious: advisor tokens are billed at Opus rates; keep calls targeted.

**Example**
```
claude_advisor {
  question: "Should we split the service into read/write paths or keep a single handler?",
  task_context: "Current design: monolith handler in api/server.ts; performance concerns under load",
  files: ["api/server.ts", "api/routes/index.ts"]
}
```

---

## Plan Format — Architecture Diagrams Required

Every plan written to `.context/todo.md` MUST include an `## Architecture` section with a mermaid diagram, unless the change is a trivial single-file fix (typo, config tweak). The plan viewer renders mermaid diagrams interactively with zoom, pan, fullscreen, and SVG download. Use `graph LR` for data/request flows, `graph TD` for hierarchies, `sequenceDiagram` for multi-step interactions.

---

## When In Doubt
If a user instruction is ambiguous, **ask for clarification**. Do not assume the most aggressive interpretation. "Do it" means "do the local work" — not "deploy to the world."


<!-- BEGIN CMD INTEGRATION v:1 profile:minimal -->
## cmd (Commander v2) — Task Tracking

This project uses **cmd (Commander v2)** for task tracking. Run `cmd guide agent` for the live agent contract.

### 🛑 MANDATORY Pre-flight Checklist — read BEFORE every `cmd task add`

`cmd` does **not** enforce these at runtime — it warns and creates the task anyway. The agent is the enforcement layer. Before you press enter on any `cmd task add`:

1. **Identity flags** — `--runtime claude-code --model <name>` (without these the board shows "unknown")
2. **Root or subtask?**
   - **Root task** (no `--parent`) → **`--mission-brief "1-3 sentence what & why"` is REQUIRED**. No exceptions. If you don't have a brief, write one in two sentences answering *"what is this task building, and why does the user need it?"* before creating the task.
   - **Subtask** (`--parent <id>`) → brief is inherited from the parent. Do **NOT** repeat it on the child.
3. **If `cmd` warns about a missing brief** — it has already created the task without one. Do not accept this as success: immediately run `cmd task update <id> --mission-brief "..." --runtime claude-code --model <m>` to backfill, or `cmd task update <id> --status cancelled` if the task should not have been created.

### Enforcement: `scripts/cmd` wrapper

A guard wrapper lives at `scripts/cmd` and is auto-shadowed in front of the real `cmd` binary via `.claude/settings.json` (`env.PATH` prepends `scripts/` to PATH for new sessions). It intercepts `cmd task add` only — every other subcommand passes through unchanged. If a root `task add` is attempted without `--mission-brief` (and without `--parent`), the wrapper **exits 2** with an explanation; the task is NOT created. Tests live at `scripts/cmd.test.sh`. Bypass for testing only via `CMD_GUARD=off`.

Verify in a new session:
```bash
which cmd                       # → /Users/ricardo/Workshop/GitHub/agent-pi/scripts/cmd
scripts/cmd.test.sh             # → "Results: 10 passed, 0 failed"
```

### Quick Reference

```bash
cmd task list                          # All tasks
# Root task — --mission-brief is MANDATORY (see checklist above)
cmd task add "Title" --mission-brief "1-3 sentence what & why" --runtime claude-code --model <m>
# Subtask — brief inherited from parent, do NOT repeat
cmd task add "Title" --parent <id> --runtime claude-code --model <m>
cmd context <id>                       # Full task context bundle
cmd task claim <id> --runtime claude-code --model <m>     # Claim work
cmd task comment <id> "msg" --type progress|error --runtime claude-code --model <m>  # Log progress
cmd task update <id> --status completed --runtime claude-code --model <m>   # Complete
```

### Other Rules

- Use `cmd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, `bd`, or markdown TODO lists
- Run `cmd guide agent` (or `cmd guide overview`) for the canonical command reference

### Skills (Default)

These skills ship with the project under `skills/` and are loaded by default. Tracker-aware skills route through `cmd`.

**Bound to operational modes:**
- `diagnose` — canonical loop for INVESTIGATE mode (wired in `extensions/lib/mode-prompts.ts:buildInvestigatePrompt`)
- `grill-with-docs` — plan validation against `CONTEXT.md` + `docs/adr/` (wired in `buildPlanPrompt`)

**Standalone slash commands:**
- `/diagnose`, `/grill-me`, `/grill-with-docs`, `/prototype`, `/improve-architecture`, `/tdd`
- `/triage`, `/to-issues`, `/to-prd` — all route through `cmd task add` / `cmd task update`
- `/zoom-out`, `/handoff`, `/caveman`, `/write-a-skill`

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds (when explicitly authorized).

**MANDATORY WORKFLOW:**

1. **File tasks for remaining work** — `cmd task add "..." --parent <root> --runtime claude-code --model <m>`
2. **Run quality gates** (if code changed) — tests, linters, builds
3. **Update task status** — `cmd task update <id> --status completed` on finished slices
4. **PUSH TO REMOTE** (only when the user has authorized push for this session):
   First, inspect the current branch and configured remotes so the explicit
   `<remote> <branch>` pair is known and intentional:
   ```bash
   git branch --show-current
   git remote -v
   ```
   Then push using the explicit remote/branch the user authorized (never bare
   `git push`, which can silently target the wrong remote — `origin` is the
   public mirror in this repo):
   ```bash
   git pull --rebase <remote> <branch>
   git push <remote> <branch>
   git status -sb  # MUST show "up to date with <remote>/<branch>"
   ```
5. **Clean up** — clear stashes, prune remote branches
6. **Verify** — all changes committed AND pushed
7. **Hand off** — provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push <remote> <branch>` succeeds (when push is authorized for this session)
- Per Git Operations policy above: NEVER push without explicit user instruction; NEVER use bare `git push`; NEVER push to `origin` (public) without explicit per-push approval
- If push fails after authorization, resolve and retry until it succeeds
<!-- END CMD INTEGRATION -->
