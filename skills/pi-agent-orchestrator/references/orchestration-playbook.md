# Orchestration Playbook

## Mode Selection Matrix

| Request shape | Recommended mode | Bridge command |
|---|---|---|
| One specialist, narrow scope | `dispatch` | `node scripts/pi-agent-orchestrator.mjs dispatch ...` |
| Multiple independent specialists | `batch` | `node scripts/pi-agent-orchestrator.mjs batch ...` |
| Ordered plan/build/review flow | `chain` | `node scripts/pi-agent-orchestrator.mjs chain ...` |
| Large multi-phase effort | `pipeline` planning contract | `node scripts/pi-agent-orchestrator.mjs plan --phase-count 3 ...` |

## Standard Sequence

1. Run `inspect`
2. Run `plan`
3. Ask for approval if the plan reports `requiresApproval: true`
4. Execute `dispatch`, `batch`, or `chain`
5. Summarize returned JSON and any agent failures

## Examples

### Example: One read-only research agent

```bash
node scripts/pi-agent-orchestrator.mjs dispatch \
  --agent scout \
  --task "Trace the OAuth flow and list the entry points." \
  --execute
```

### Example: Parallel prep work

```bash
node scripts/pi-agent-orchestrator.mjs batch \
  --spec .context/pi-batch.json \
  --approved true \
  --execute
```

### Example: Sequential implementation flow

```bash
node scripts/pi-agent-orchestrator.mjs chain \
  --chain plan-build-review \
  --task "Add the requested extension and update tests." \
  --approved true \
  --execute
```

## Notes

- `pipeline` is intentionally plan-first in v1. Translate it into concrete `batch` or `chain` execution where possible.
- The bridge operates in the caller's current working directory unless `--cwd` is provided.
- The bridge reuses `agents/*.md`, `agents/models.json`, and `agents/agent-chain.yaml` from this repository.
