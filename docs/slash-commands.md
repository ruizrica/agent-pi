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
| LM Studio | `/lmstudio` | `/lmstudio status`, `/lmstudio sync`, `/lmstudio models`, `/lmstudio model <id>`, `/lmstudio infer <prompt>` |
| Subagents | `/sub` | `/sub <task>`, `/sub continue <id> <prompt>`, `/sub remove <id>`, `/sub clear` |
| Chain | `/chain` | `/chain`, `/chain list`, `/chain clear` are still separate commands today |
| Pacifico | `/pacifico` | Pacifico still has separate commands; consolidation is deferred because of async job-state complexity |

## LM Studio Local Inference

`/lmstudio` connects Pi to the LM Studio OpenAI-compatible local server. LM Studio must have **Local Server** toggled on and should respond at `http://127.0.0.1:1234/v1/models` before inference can run.

Common usage:

- `/lmstudio status` — check whether the local server is reachable and list loaded models.
- `/lmstudio sync` or `/lmstudio models` — refresh the Pi `lmstudio` provider from LM Studio's `/v1/models` response.
- `/lmstudio model google/gemma-4-12b-qat` — set the preferred local model for the current session.
- `/lmstudio infer "hello"` — send a prompt to the preferred local model through `/v1/chat/completions`.
- `/gemma on` — route eligible builder/worker agents to the configured Gemma LM Studio model.
- `/qwen on` — route eligible builder/worker agents to the configured Qwen LM Studio model.

Configuration overrides:

| Setting | Purpose | Default |
|---|---|---|
| `LMSTUDIO_BASE_URL` | OpenAI-compatible LM Studio base URL | `http://127.0.0.1:1234/v1` |
| `PI_LMSTUDIO_MODEL_ID` | Preferred local model for direct inference/session routing | first loaded model or `google/gemma-4-12b-qat` fallback |
| `PI_LMSTUDIO_GEMMA_MODEL_ID` | Model used by `/gemma on` worker routing | `google/gemma-4-12b-qat` |
| `PI_LMSTUDIO_QWEN_MODEL_ID` | Model used by `/qwen on` worker routing | `qwen/qwen3.6-27b` |

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

- **63** static root extension commands.
- **15** markdown toolkit commands under `commands/**/*.md`.
- **78** total public registrations.
- **78** unique public names.
- **0** active extension-vs-markdown duplicates.

`extensions/__tests__/slash-command-inventory.test.ts` guards this cross-surface uniqueness contract.
