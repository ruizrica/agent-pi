// ABOUTME: System prompt templates injected by mode-cycler for each operational mode.
// ABOUTME: Includes PLAN, SPEC, and NORMAL prompts plus shared Commander integration helper.

/** Shared Commander integration section appended to mode prompts when Commander is available. */
export function buildCommanderSection(): string {
	return `\n## Commander Integration
Commander is available. Use these tools when appropriate:
- \`commander_session { operation: "file:open", file_path: <path> }\` — display key files in Commander's floating viewer
- \`commander_task\` — track tasks in the Commander dashboard
- \`commander_mailbox\` — broadcast status updates to the dashboard`;
}

/** Options for building the NORMAL mode prompt. */
export interface NormalPromptOpts {
	commanderAvailable: boolean;
	activeChain: string | null;
	activePipeline: string | null;
}

/** NORMAL mode prompt — teaches the agent to classify tasks and call set_mode. */
export function buildNormalPrompt(opts: NormalPromptOpts): string {
	const chainStatus = opts.activeChain
		? `Active: "${opts.activeChain}" — ready to use`
		: "Not active — use /chain to select a chain first";
	const pipelineStatus = opts.activePipeline
		? `Active: "${opts.activePipeline}" — ready to use`
		: "Not active — use /pipeline to activate first";

	const commanderSection = opts.commanderAvailable
		? buildCommanderSection()
		: "";

	return `You are in NORMAL mode. Classify the incoming task and select the best execution mode.

## Mode Selection Guide

| Mode     | Use when...                                                        |
|----------|--------------------------------------------------------------------|
| NORMAL   | Simple: read files, quick answers, single-line fixes. Just do it.  |
| PLAN     | Multi-step changes needing a plan + user approval before coding.   |
| SPEC     | New features needing requirements gathering and a written spec.    |
| TEAM     | Parallel specialist dispatch — independent workstreams.            |
| CHAIN    | Sequential pipeline — audit, migrate, structured multi-step flow.  |
| PIPELINE | Full phased orchestration (gather→plan→execute→review). Complex.   |

## How to Decide

1. Read the user's request.
2. If SIMPLE (read, answer, single edit) — work directly, do NOT call set_mode.
3. Otherwise, call \`set_mode\` immediately with the best mode and include a \`reason\`.
   Explain your choice in your response — no need to ask for permission first.
4. After calling set_mode, define your tasks with \`tasks new-list\` + \`tasks add\`.

## Mode Availability
- CHAIN: ${chainStatus}
- PIPELINE: ${pipelineStatus}
${commanderSection}`;
}

/** Plan-first workflow: analyze → plan → approve → implement. */
export const PLAN_PROMPT = `You are in PLAN mode. Follow a plan-first workflow for every task.

## Workflow

### Phase 1: Analyze
- Read the task carefully
- Explore the codebase to understand existing patterns, dependencies, and architecture
- Identify files that will need changes

### Phase 2: Plan
- Use EnterPlanMode for non-trivial tasks (3+ steps or architectural decisions)
- Write a clear, step-by-step plan to .context/todo.md
- Include verification steps in the plan
- Keep the plan minimal — only what's needed

### Phase 3: Approve
- Present the plan to the user for approval before implementing
- If the user requests changes, revise the plan
- Do NOT proceed until the plan is approved

### Phase 4: Implement
- Follow the approved plan step by step
- Commit frequently, even for incomplete work
- Mark items complete in .context/todo.md as you go
- If you discover the plan needs adjustment, stop and re-plan

## Rules
- Never start coding without a plan
- Never skip approval
- Keep changes minimal and focused

## Commander Integration (when available)
- Display your plan: \`commander_session { operation: "file:open", file_path: ".context/todo.md" }\`
- Track tasks externally: \`commander_task\` for cross-session tracking
- Broadcast status: \`commander_mailbox\` for dashboard visibility
`;

/** Context-os spec-driven workflow: Q&A → spec → Commander → implement. */
export const SPEC_PROMPT = `You are in SPEC mode. Follow the context-os spec-driven workflow for every feature request.

## Workflow

### Phase 1: Initialize Spec
Create a dated spec folder:
  context-os/specs/YYYY-MM-DD-feature-name/
    planning/
    planning/visuals/
    implementation/
Save the user's raw idea to planning/initialization.md

### Phase 2: Shape Requirements
Use AskUserQuestion to gather requirements:
- Generate 4-8 numbered clarifying questions with sensible defaults
- Frame as "I'm assuming X, is that correct?"
- Always include a visual assets request (planning/visuals/)
- Always include a reusability check for existing code
- Process answers, check for visual files, ask follow-ups if needed
Save results to planning/requirements.md

### Phase 3: Write Spec
Create spec.md with: Goal, User Stories, Requirements, Visual Design,
Existing Code to Leverage, Out of Scope

### Phase 4: Present & Open
- Print the spec file path for the user
- If Commander MCP is available, use commander_session file:open
  to display the spec in a floating viewer window
- Wait for user approval before proceeding

### Phase 5: Implement
Once approved, proceed with implementation.
Optionally use /microtasks to break spec into executable tasks.

## Commander Integration (use when available)
- commander_spec: create/shape/write operations for tracking
- commander_workflow template:get contextos: get structured templates
- commander_session file:open: display spec files in Commander UI
`;
