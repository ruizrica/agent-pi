---
name: pi-agent-orchestrator
description: Use Cloud Code to inspect, plan, and orchestrate local Pi agents through a reusable bridge script, existing Pi agent definitions, and approval gates for broad writes or multi-agent execution.
license: MIT
compatibility: Claude Code, Pi
metadata:
  category: orchestration
  complexity: advanced
  author: Agent Pi
  version: "1.0.0"
---

# Pi Agent Orchestrator

Use this skill when the user wants Cloud Code to treat the local Pi agent suite as an orchestration backend: dispatching a single Pi agent, launching coordinated multi-agent work, or running an existing chain.

This skill does not create a new OAuth flow. It reuses the repository's existing token path:
- `CLAUDE_CODE_OAUTH_TOKEN`
- `PI_CLAUDE_OAUTH_TOKEN`
- fallback: `ANTHROPIC_OAUTH_TOKEN`

The bridge entrypoint is:

```bash
node scripts/pi-agent-orchestrator.mjs <command> [...flags]
```

Read these references before executing anything non-trivial:
- `references/orchestration-playbook.md`
- `references/approval-policy.md`
- `references/tool-and-agent-map.md`

## When to Use

- The user wants Cloud Code to delegate work to Pi agents
- The user wants Pi agents to behave like tools or subagents
- The task should reuse `agents/*.md` and `agents/agent-chain.yaml`
- The user wants a Cloud Code-safe way to inspect or route Pi workflows

## Rules

1. Always start with `inspect` or `plan` before launching orchestration.
2. Use `dispatch` for one specialist agent.
3. Use `batch` for multiple independent agents that can run in parallel.
4. Use `chain` for ordered, sequential workflows already defined in `agents/agent-chain.yaml`.
5. Treat `pipeline` as a planning contract in v1. If execution is needed, translate the work into `chain` or `batch`.
6. Ask for approval before:
   - broad writes
   - any multi-agent execution (`batch`, `chain`, or `pipeline`)
7. Prefer the narrowest orchestration mode that satisfies the request.
8. Keep execution in the user's current working directory unless they specify another path.

## Core Workflow

### Step 1: Inspect the local Pi orchestration surface

```bash
node scripts/pi-agent-orchestrator.mjs inspect
```

Use the result to confirm:
- auth token visibility
- available agents
- available chains
- supported modes

### Step 2: Plan the orchestration mode

Examples:

```bash
node scripts/pi-agent-orchestrator.mjs plan --mode auto --agent-count 1 --write-scope narrow
node scripts/pi-agent-orchestrator.mjs plan --mode auto --agent-count 3 --parallel true --write-scope narrow
node scripts/pi-agent-orchestrator.mjs plan --mode auto --phase-count 3 --write-scope broad
```

Use the planned mode to decide the next command.

### Step 3: Execute the narrowest fitting mode

#### Single-agent dispatch

```bash
node scripts/pi-agent-orchestrator.mjs dispatch \
  --agent scout \
  --task "Map the authentication flow and list the key files." \
  --execute
```

If broad writes are requested, add approval first and then use:

```bash
node scripts/pi-agent-orchestrator.mjs dispatch \
  --agent builder \
  --task "Implement the approved fix." \
  --write-scope broad \
  --approved true \
  --execute
```

#### Parallel multi-agent batch

Write a JSON spec file first, for example `.context/pi-batch.json`:

```json
[
  { "name": "scout", "task": "Map the repo structure." },
  { "name": "planner", "task": "Draft the implementation sequence." },
  { "name": "reviewer", "task": "List the main risks and review points." }
]
```

Then, after approval:

```bash
node scripts/pi-agent-orchestrator.mjs batch \
  --spec .context/pi-batch.json \
  --approved true \
  --execute
```

#### Sequential chain execution

```bash
node scripts/pi-agent-orchestrator.mjs chain \
  --chain plan-build-review \
  --task "Implement the approved feature end to end." \
  --approved true \
  --execute
```

## Output Expectations

After each bridge command:
1. Summarize what mode was chosen
2. State whether approval was required or already granted
3. Quote the returned JSON status clearly
4. For execution commands, summarize each agent or chain step and call out failures explicitly

## Practical Guidance

- Start with `dispatch` unless the task clearly requires multiple agents.
- Use `batch` only when the tasks are independent.
- Use `chain` when the order matters and a matching chain already exists.
- If the user asks for a complex pipeline, use `plan` plus the reference docs to decide whether to convert it into a `chain`, a `batch`, or a staged manual workflow.
