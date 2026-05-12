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


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
