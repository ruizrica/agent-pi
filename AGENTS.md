# Agent Instructions

This project uses **cmd** (Commander v2) for task tracking. Run `cmd guide agent` for the full agent contract.

## Quick Reference

```bash
cmd task list                                                  # All tasks
cmd context <id>                                               # Full task context
cmd task claim <id> --runtime claude-code --model <m>          # Claim work
cmd task comment <id> "..." --type progress --runtime claude-code --model <m>
cmd task update <id> --status completed --runtime claude-code --model <m>
```

## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i` (interactive) mode on some systems, causing the agent to hang indefinitely waiting for y/n input.

**Use these forms instead:**
```bash
# Force overwrite without prompting
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file
```

> ⚠️ **Recursive destruction is forbidden by project policy.** Do NOT use `rm -rf`,
> `rm -r`, or any other recursive delete in agent workflows — the user removes
> directories manually. If a workflow seems to require recursive deletion, stop
> and ask. See CLAUDE.md → "File Operations" for the full rule.

**Other commands that may prompt:**
- `scp` - use `-o BatchMode=yes` for non-interactive
- `ssh` - use `-o BatchMode=yes` to fail instead of prompting
- `apt-get` - use `-y` flag
- `brew` - use `HOMEBREW_NO_AUTO_UPDATE=1` env var

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

### Quick Reference

```bash
cmd task list                                                                            # All tasks
# Root task — --mission-brief is MANDATORY (see checklist above)
cmd task add "Title" --mission-brief "1-3 sentence what & why" --runtime claude-code --model <m>
# Subtask — brief inherited from parent, do NOT repeat
cmd task add "Title" --parent <id> --runtime claude-code --model <m>
cmd context <id>                                                                         # Full task context bundle
cmd task claim <id> --runtime claude-code --model <m>                                    # Claim work
cmd task comment <id> "msg" --type progress|error --runtime claude-code --model <m>      # Log progress
cmd task update <id> --status completed --runtime claude-code --model <m>                # Complete
```

### Other Rules

- Use `cmd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, `bd`, or markdown TODO lists
- Run `cmd guide agent` (or `cmd guide overview`) for the canonical command reference

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
- Per Git Operations policy in CLAUDE.md: NEVER push without explicit user instruction; NEVER use bare `git push`; NEVER push to `origin` (public) without explicit per-push approval
- If push fails after authorization, resolve and retry until it succeeds
<!-- END CMD INTEGRATION -->
