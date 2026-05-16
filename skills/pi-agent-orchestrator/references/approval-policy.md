# Approval Policy

## Approval is required when

1. The orchestration mode is `batch`
2. The orchestration mode is `chain`
3. The orchestration mode is `pipeline`
4. The requested write scope is `broad`

## Approval is not automatically required when

- The mode is `dispatch`
- The write scope is `none` or `narrow`
- Only one specialist agent is being used

## How to apply the rule

- Run `plan` first.
- If the result contains `requiresApproval: true`, ask the user before adding `--approved true`.
- Do not silently escalate a dispatch into a batch or chain.
- If the user changes scope from review to implementation, rerun `plan`.

## Examples

### No approval needed

```bash
node scripts/pi-agent-orchestrator.mjs dispatch \
  --agent reviewer \
  --task "Review this patch for correctness." \
  --execute
```

### Approval required for broad-write dispatch

```bash
node scripts/pi-agent-orchestrator.mjs dispatch \
  --agent builder \
  --task "Apply the approved refactor." \
  --write-scope broad \
  --approved true \
  --execute
```

### Approval required for multi-agent work

```bash
node scripts/pi-agent-orchestrator.mjs chain \
  --chain plan-build-review \
  --task "Implement the approved feature." \
  --approved true \
  --execute
```
