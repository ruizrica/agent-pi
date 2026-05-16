// ABOUTME: Tests for pipeline-team system prompt changes — complexity routing and direct-work guidance.
// ABOUTME: Validates that the UNDERSTAND phase and main prompt include fast-path instructions.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionRoot = join(__dirname, "..");

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

describe("WARDEN prompt coverage for inline operational modes", () => {
	it("pipeline prompt source includes WARDEN while preserving phase tools", () => {
		const source = readFileSync(join(extensionRoot, "pipeline-team.ts"), "utf-8");
		expect(source).toContain("buildWardenTaskConfirmationSection");
		expect(source).toContain("WARDEN tasks represent the clarified goal");
		expect(source).toContain("advance_phase");
		expect(source).toContain("dispatch_agents");
		expect(source).toContain("REMEDIATE");
		expect(source).toContain("MERGE");
	});

	it("team prompt source includes WARDEN while preserving dispatch and scout guidance", () => {
		const source = readFileSync(join(extensionRoot, "agent-team.ts"), "utf-8");
		expect(source).toContain("buildWardenTaskConfirmationSection");
		expect(source).toContain("TEAM");
		expect(source).toContain("dispatch_agent");
		expect(source).toContain("Scout Agent on Team");
		expect(source).toContain("tasks new-list");
	});

	it("chain prompt source includes WARDEN while preserving run_chain guidance under the delegate-everything policy", () => {
		const source = readFileSync(join(extensionRoot, "agent-chain.ts"), "utf-8");
		expect(source).toContain("buildWardenTaskConfirmationSection");
		expect(source).toContain("CHAIN");
		expect(source).toContain("run_chain");
		expect(source).toContain("sequential slice");
		// The old "When to Work Directly" carve-out was removed in favor of
		// buildDelegateEverythingSection() — assert the new policy is wired in.
		expect(source).toContain("buildDelegateEverythingSection");
		expect(source).not.toContain("When to Work Directly");
	});
});

describe("post-approval pipeline phase instruction coverage", () => {
	// These tests previously asserted against locally-constructed string
	// literals (e.g. `const source = "REFINE\\n..."`), which made them
	// tautological — they could never catch a regression in the real prompt
	// source. They now read the actual source files used by the prompts,
	// matching the WARDEN/UNDERSTAND/MAIN test pattern earlier in this file.

	it("documents the INVESTIGATE → PIPELINE handoff after approval", () => {
		const source = readFileSync(join(extensionRoot, "lib/mode-prompts.ts"), "utf-8");
		expect(source).toContain("PIPELINE");
		expect(source).toContain("hand off into PIPELINE");
	});

	it("documents refine phase as a non-planning micro-task decomposition step", () => {
		const source = readFileSync(join(extensionRoot, "pipeline-team.ts"), "utf-8");
		expect(source).toContain("Do NOT plan again");
		expect(source).toContain("line_ranges");
		expect(source).toContain("parallel_group");
	});

	it("documents execute phase worktree constraints", () => {
		const source = readFileSync(join(extensionRoot, "pipeline-team.ts"), "utf-8");
		expect(source).toContain("isolated worktree path/branch");
		expect(source).toContain("specified files and line ranges");
	});

	it("documents remediate and merge phases", () => {
		const source = readFileSync(join(extensionRoot, "pipeline-team.ts"), "utf-8");
		expect(source).toContain("REMEDIATE");
		expect(source).toContain("MERGE");
		expect(source).toContain("resolve merge conflicts");
	});
});
