# Slash Commands

This repo exposes slash commands from two surfaces:

1. **Extension commands** — root `extensions/*.ts` files calling `pi.registerCommand(...)`. Use these for runtime/UI features.
2. **Markdown toolkit commands** — `commands/**/*.md`, loaded by `extensions/toolkit-commands.ts` when `.pi/commands/` is absent. Use these for prompt/workflow commands.

Disabled placeholders should not live under `commands/`; they still register as active markdown commands.

## Canonical Command Families

| Family | Canonical command | Subcommands / usage |
|---|---|---|
| Pipeline | `/pipeline` | `/pipeline`, `/pipeline status`, `/pipeline reset`, `/pipeline off`, `/pipeline clear` |
| Agent teams | `/agents` | `/agents team`, `/agents list`, `/agents grid <1-6>`, `/agents clear` |
| OpenRouter | `/openrouter` | `/openrouter status`, `/openrouter sync`, `/openrouter enrich <model>`, `/openrouter preview <model>`, `/openrouter balance` |
| Subagents | `/sub` | `/sub <task>`, `/sub continue <id> <prompt>`, `/sub remove <id>`, `/sub clear` |
| Chain | `/chain` | `/chain`, `/chain list`, `/chain clear` are still separate commands today |
| Pacifico | `/pacifico` | Pacifico still has separate commands; consolidation is deferred because of async job-state complexity |

## Retired Commands

| Retired command | Replacement |
|---|---|
| `/claudemode` | `/claude-mode` |
| markdown `/claude` placeholder | extension-owned `/claude` |
| `/pipeline-status` | `/pipeline status` |
| `/pipeline-reset` | `/pipeline reset` |
| `/pipeline-off` | `/pipeline off` |
| `/pipeline-clear` | `/pipeline clear` |
| `/agents-team` | `/agents team` |
| `/agents-list` | `/agents list` |
| `/agents-grid <n>` | `/agents grid <n>` |
| `/agents-clear` | `/agents clear` |
| `/openrouter-sync` | `/openrouter sync` |
| `/openrouter-enrich <model>` | `/openrouter enrich <model>` |
| `/openrouter-preview <model>` | `/openrouter preview <model>` |
| `/openrouter-balance` | `/openrouter balance` |
| `/openrouter-status` | `/openrouter status` |
| `/subcont <id> <prompt>` | `/sub continue <id> <prompt>` |
| `/subrm <id>` | `/sub remove <id>` |
| `/subclear` | `/sub clear` |

## Current Inventory Snapshot

After this cleanup, the public command inventory in this checkout is:

- **62** static root extension commands.
- **15** markdown toolkit commands under `commands/**/*.md`.
- **77** total public registrations.
- **77** unique public names.
- **0** active extension-vs-markdown duplicates.

`extensions/__tests__/slash-command-inventory.test.ts` guards this cross-surface uniqueness contract.
