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

## When In Doubt
If a user instruction is ambiguous, **ask for clarification**. Do not assume the most aggressive interpretation. "Do it" means "do the local work" — not "deploy to the world."
