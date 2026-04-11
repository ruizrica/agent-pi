# Tool and Agent Map

## Reused Pi orchestration surfaces

| Existing source | Reused for |
|---|---|
| `agents/*.md` | Specialist definitions, tools, and system prompts |
| `agents/models.json` | Model resolution for spawned Pi agents |
| `agents/agent-chain.yaml` | Sequential chain definitions |
| `extensions/agent-team.ts` | Reference behavior for specialist dispatch |
| `extensions/agent-chain.ts` | Reference behavior for chain execution |
| `extensions/subagent-widget.ts` | Reference behavior for multi-agent orchestration patterns |
| `extensions/oauth-provider.ts` | Cloud Code token reuse path |

## Common core agents

| Agent | Best use |
|---|---|
| `scout` | Recon, structure mapping, read-only exploration |
| `planner` | Implementation planning and sequencing |
| `builder` | Code changes and implementation |
| `reviewer` | Code review, risk analysis, validation |
| `tester` | Test strategy and execution |
| `red-team` | Adversarial review and security analysis |

## Bridge commands

| Command | Purpose |
|---|---|
| `inspect` | Show auth, agents, chains, and supported modes |
| `plan` | Choose the orchestration mode and check whether approval is required |
| `dispatch` | Run one Pi agent directly |
| `batch` | Run multiple Pi agents in parallel from a JSON spec |
| `chain` | Run an existing chain from `agents/agent-chain.yaml` |
| `pipeline` | Planning-only contract in v1 |

## OAuth note

The bridge does not introduce a new OAuth implementation. It expects the existing token path already supported by this repo:
- `CLAUDE_CODE_OAUTH_TOKEN`
- `PI_CLAUDE_OAUTH_TOKEN`
- `ANTHROPIC_OAUTH_TOKEN`
