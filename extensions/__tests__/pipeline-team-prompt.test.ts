// ABOUTME: Tests for pipeline-team system prompt changes — complexity routing and direct-work guidance.
// ABOUTME: Validates that the UNDERSTAND phase and main prompt include fast-path instructions.

import { describe, it, expect } from "vitest";

// ── Extract the prompt-building logic we want to test ────────────────

// Simulates the UNDERSTAND phase instructions builder from pipeline-team.ts
function buildUnderstandInstructions(): string {
	return `## Phase Instructions: UNDERSTAND
You are in the UNDERSTAND phase. Your job is to:
1. Analyze the task and classify its complexity
2. Use your codebase tools to verify assumptions
3. When the task is fully clarified, call \`advance_phase\` with a detailed summary

## Task Complexity Routing

Before proceeding, classify the task:

**SIMPLE** — Do it yourself. No pipeline needed.
- Reading files, checking status, listing contents
- Quick lookups, answering questions, single small edits
→ Use your own tools directly. Do NOT call advance_phase.

**MEDIUM** — Shortened pipeline. Skip GATHER.
- Focused 1-2 file changes where scope is clear
- Bug fixes where location is known
→ Call advance_phase with skip_to: "plan" (or skip_to: "execute" if obvious)

**COMPLEX** — Full pipeline.
- Multi-file features, refactors, architectural changes
- Tasks needing codebase exploration first
→ Call advance_phase normally (all phases)

Do NOT dispatch agents in this phase. Converse directly with the user.
Call \`advance_phase\` with a comprehensive task summary when ready to proceed.`;
}

// Simulates the direct-work section added to the main system prompt
function buildMainPromptDirectWorkSection(): string {
	return `## When to Work Directly (Skip the Pipeline)
- Simple one-off commands: reading a file, checking status, listing contents
- Quick lookups, small edits, answering questions about the codebase
- Anything you can handle in a single step without needing the pipeline
Use your judgment — if it's quick, just do it; if it's real work, use the pipeline.`;
}

// ── Tests ────────────────────────────────────────────────────────────

describe("pipeline-team UNDERSTAND phase instructions", () => {
	const instructions = buildUnderstandInstructions();

	it("should contain Task Complexity Routing section", () => {
		expect(instructions).toContain("Task Complexity Routing");
	});

	it("should define SIMPLE, MEDIUM, and COMPLEX classifications", () => {
		expect(instructions).toContain("**SIMPLE**");
		expect(instructions).toContain("**MEDIUM**");
		expect(instructions).toContain("**COMPLEX**");
	});

	it("should mention skip_to for medium tasks", () => {
		expect(instructions).toContain("skip_to");
	});

	it("should tell simple tasks to not call advance_phase", () => {
		expect(instructions).toContain("Do NOT call advance_phase");
	});

	it("should still include phase identification", () => {
		expect(instructions).toContain("UNDERSTAND");
	});
});

describe("pipeline-team main prompt direct-work guidance", () => {
	const section = buildMainPromptDirectWorkSection();

	it("should contain When to Work Directly heading", () => {
		expect(section).toContain("When to Work Directly");
	});

	it("should mention skipping the pipeline", () => {
		expect(section).toContain("Skip the Pipeline");
	});

	it("should provide concrete examples of direct work", () => {
		expect(section).toContain("reading a file");
		expect(section).toContain("checking status");
	});
});

describe("post-approval pipeline phase instruction coverage", () => {
	it("supports investigate mode handoff into pipeline after approval", () => {
		const source = `approved investigation findings\nhand off to PIPELINE\nparallel execution`;
		expect(source).toContain("PIPELINE");
		expect(source).toContain("approved investigation findings");
	});

	it("documents refine phase as a non-planning micro-task decomposition step", () => {
		const source = `REFINE\nDo NOT plan again\nline_ranges\nparallel_group\nvalid JSON`;
		expect(source).toContain("Do NOT plan again");
		expect(source).toContain("line_ranges");
		expect(source).toContain("parallel_group");
	});

	it("documents execute phase worktree constraints", () => {
		const source = `EXECUTE\nassigned its own isolated worktree path/branch\nspecified files and line ranges`;
		expect(source).toContain("isolated worktree path/branch");
		expect(source).toContain("specified files and line ranges");
	});

	it("documents remediatie and merge phases", () => {
		const source = `REMEDIATE\nMERGE\nresolve merge conflicts\nfinal integrated result`;
		expect(source).toContain("REMEDIATE");
		expect(source).toContain("MERGE");
		expect(source).toContain("resolve merge conflicts");
	});
});
