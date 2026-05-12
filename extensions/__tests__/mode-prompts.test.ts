// ABOUTME: Tests for PLAN and SPEC system prompt templates.
// ABOUTME: Validates that prompts contain expected keywords for their workflows.

import { describe, it, expect } from "vitest";
import {
	INVESTIGATE_PROMPT,
	PLAN_PROMPT,
	SPEC_PROMPT,
	buildDelegateEverythingSection,
	buildNormalPrompt,
} from "../lib/mode-prompts.ts";

describe("PLAN_PROMPT", () => {
	it("is a non-empty string", () => {
		expect(typeof PLAN_PROMPT).toBe("string");
		expect(PLAN_PROMPT.length).toBeGreaterThan(0);
	});

	it("contains 'plan'", () => {
		expect(PLAN_PROMPT.toLowerCase()).toContain("plan");
	});

	it("contains 'approve'", () => {
		expect(PLAN_PROMPT.toLowerCase()).toContain("approve");
	});

	it("contains 'implement'", () => {
		expect(PLAN_PROMPT.toLowerCase()).toContain("implement");
	});

	it("contains 'commander_task'", () => {
		expect(PLAN_PROMPT).toContain("commander_task");
	});

	it("contains '.context/todo.md'", () => {
		expect(PLAN_PROMPT).toContain(".context/todo.md");
	});
});

describe("PLAN_PROMPT — Commander-first enforcement", () => {
	it("contains 'ALWAYS' for Commander usage", () => {
		expect(PLAN_PROMPT).toContain("ALWAYS");
	});
});

describe("PLAN_PROMPT — scout-based context gathering", () => {
	it("instructs spawning scout subagents for context gathering", () => {
		expect(PLAN_PROMPT.toLowerCase()).toContain("scout");
	});

	it("references subagent_create_batch tool", () => {
		expect(PLAN_PROMPT).toContain("subagent_create_batch");
	});

	it("specifies spawning 4 scouts by default", () => {
		expect(PLAN_PROMPT).toContain("4 scout subagents");
	});

	it("includes example scout dispatch with focused tasks", () => {
		expect(PLAN_PROMPT).toContain("Structure scout");
		expect(PLAN_PROMPT).toContain("Pattern scout");
		expect(PLAN_PROMPT).toContain("Data flow scout");
		expect(PLAN_PROMPT).toContain("Test scout");
	});

	it("provides guidance on skipping scouts for simple tasks", () => {
		expect(PLAN_PROMPT).toContain("Simple tasks");
		expect(PLAN_PROMPT).toContain("skip scouts");
	});

	it("instructs to synthesize scout findings", () => {
		expect(PLAN_PROMPT.toLowerCase()).toContain("synthesize");
	});

	it("lists typical scout assignment types", () => {
		expect(PLAN_PROMPT).toContain("Dependency scout");
		expect(PLAN_PROMPT).toContain("Config scout");
	});
});

describe("PLAN_PROMPT — WARDEN task confirmation", () => {
	it("teaches WARDEN without replacing plan approval", () => {
		expect(PLAN_PROMPT).toContain("WARDEN");
		expect(PLAN_PROMPT).toContain("tasks new-list");
		expect(PLAN_PROMPT).toContain("tasks add");
		expect(PLAN_PROMPT).toContain("tasks toggle");
		expect(PLAN_PROMPT).toContain("inprogress");
		expect(PLAN_PROMPT.toLowerCase()).toContain("continue");
		expect(PLAN_PROMPT).toContain("never replaces mandatory `show_plan` approval");
	});
});

describe("PLAN_PROMPT — structured plan format", () => {
	it("teaches phased plan structure", () => {
		expect(PLAN_PROMPT).toContain("Phase");
		expect(PLAN_PROMPT).toContain("Context");
	});

	it("includes file action indicators", () => {
		expect(PLAN_PROMPT).toContain("New file");
		expect(PLAN_PROMPT).toContain("Modify");
		expect(PLAN_PROMPT).toContain("Test first");
	});

	it("includes Critical Files section template", () => {
		expect(PLAN_PROMPT).toContain("Critical Files");
	});

	it("includes Verification section template", () => {
		expect(PLAN_PROMPT).toContain("Verification");
	});

	it("includes Reusable Components section template", () => {
		expect(PLAN_PROMPT).toContain("Reusable Components");
	});

	it("teaches Why justification for phases", () => {
		expect(PLAN_PROMPT).toContain("Why");
		expect(PLAN_PROMPT).toContain("justification");
	});

	it("emphasizes phases over flat steps", () => {
		expect(PLAN_PROMPT).toContain("Phases, not flat steps");
	});
});

describe("INVESTIGATE_PROMPT — complex problem loop", () => {
	it("is a non-empty string", () => {
		expect(typeof INVESTIGATE_PROMPT).toBe("string");
		expect(INVESTIGATE_PROMPT.length).toBeGreaterThan(0);
	});

	it("uses complex problem loop lifecycle tools", () => {
		expect(INVESTIGATE_PROMPT).toContain("complex_problem_loop_start");
		expect(INVESTIGATE_PROMPT).toContain("complex_problem_loop_advance");
	});

	it("preserves loop state concepts", () => {
		expect(INVESTIGATE_PROMPT).toContain("Next Slice");
		expect(INVESTIGATE_PROMPT).toContain("Active Hypothesis");
	});

	it("teaches the core loop stages", () => {
		expect(INVESTIGATE_PROMPT).toContain("Clarify");
		expect(INVESTIGATE_PROMPT).toContain("Recon");
		expect(INVESTIGATE_PROMPT).toContain("Synthesize");
		expect(INVESTIGATE_PROMPT).toContain("Reflect");
		expect(INVESTIGATE_PROMPT).toContain("Continue or Handoff");
	});

	it("preserves approval and PIPELINE handoff guardrails", () => {
		expect(INVESTIGATE_PROMPT).toContain("show_plan");
		expect(INVESTIGATE_PROMPT).toContain("show_spec");
		expect(INVESTIGATE_PROMPT).toContain("PIPELINE");
		expect(INVESTIGATE_PROMPT).toContain("Never start coding before clarification and approval");
	});

	it("includes WARDEN task confirmation for diagnostic slices", () => {
		expect(INVESTIGATE_PROMPT).toContain("WARDEN");
		expect(INVESTIGATE_PROMPT).toContain("tasks new-list");
		expect(INVESTIGATE_PROMPT).toContain("tasks toggle");
		expect(INVESTIGATE_PROMPT).toContain("diagnostic slice");
		expect(INVESTIGATE_PROMPT).toContain("Do not implement remediation");
	});
});

describe("SPEC_PROMPT — Commander-first enforcement", () => {
	it("contains 'ALWAYS' for Commander usage", () => {
		expect(SPEC_PROMPT).toContain("ALWAYS");
	});
});

describe("SPEC_PROMPT — WARDEN task confirmation", () => {
	it("tracks spec document slices without replacing spec approval", () => {
		expect(SPEC_PROMPT).toContain("WARDEN");
		expect(SPEC_PROMPT).toContain("tasks new-list");
		expect(SPEC_PROMPT).toContain("tasks add");
		expect(SPEC_PROMPT).toContain("tasks toggle");
		expect(SPEC_PROMPT).toContain("requirements.md, design.md, tasks.md");
		expect(SPEC_PROMPT).toContain("Do not implement before the spec is approved");
	});
});

describe("SPEC_PROMPT", () => {
	it("is a non-empty string", () => {
		expect(typeof SPEC_PROMPT).toBe("string");
		expect(SPEC_PROMPT.length).toBeGreaterThan(0);
	});

	it("contains '.kiro/specs'", () => {
		expect(SPEC_PROMPT).toContain(".kiro/specs");
	});

	it("contains 'spec'", () => {
		expect(SPEC_PROMPT.toLowerCase()).toContain("spec");
	});

	it("contains 'requirements.md'", () => {
		expect(SPEC_PROMPT).toContain("requirements.md");
	});

	it("contains 'design.md'", () => {
		expect(SPEC_PROMPT).toContain("design.md");
	});

	it("contains 'tasks.md'", () => {
		expect(SPEC_PROMPT).toContain("tasks.md");
	});

	it("requires a mermaid architecture diagram in the spec document", () => {
		expect(SPEC_PROMPT.toLowerCase()).toContain("mermaid");
		expect(SPEC_PROMPT).toContain("Architecture");
	});

	it("uses Kiro templates via commander_workflow", () => {
		expect(SPEC_PROMPT).toContain('workflow: "kiro"');
		expect(SPEC_PROMPT).toContain("template:get");
	});

	it("contains 'commander_mailbox'", () => {
		expect(SPEC_PROMPT).toContain("commander_mailbox");
	});
});

describe("buildDelegateEverythingSection — shared helper", () => {
	it("returns a non-empty string containing the canonical policy heading", () => {
		const out = buildDelegateEverythingSection({
			modeName: "NORMAL",
			dispatchTool: "subagent_create",
			dispatchExample: 'subagent_create { name: "scout", task: "Read x.ts" }',
		});
		expect(typeof out).toBe("string");
		expect(out).toContain("Delegate Everything Policy (REQUIRED)");
	});

	it("interpolates modeName, dispatchTool, and dispatchExample into the body", () => {
		const out = buildDelegateEverythingSection({
			modeName: "PIPELINE",
			dispatchTool: "dispatch_agents",
			dispatchExample: 'dispatch_agents { agents: [{ role: "builder", task: "read x" }] }',
		});
		expect(out).toContain("orchestrator in PIPELINE mode");
		expect(out).toContain("dispatch_agents");
		expect(out).toContain('dispatch_agents { agents: [{ role: "builder", task: "read x" }] }');
	});

	it("delegates reads, searches, code execution, builds, and tests", () => {
		const out = buildDelegateEverythingSection({
			modeName: "PLAN",
			dispatchTool: "subagent_create",
			dispatchExample: "subagent_create { name: \"scout\", task: \"...\" }",
		});
		expect(out).toContain("ANY file read");
		expect(out).toContain("ANY code search");
		expect(out).toContain("ANY code execution");
	});

	it("replaces 'fall back to doing the work directly' with a Recovery, not Fallback stance", () => {
		const out = buildDelegateEverythingSection({
			modeName: "NORMAL",
			dispatchTool: "subagent_create",
			dispatchExample: "subagent_create { name: \"scout\", task: \"...\" }",
		});
		expect(out).toContain("Recovery, not Fallback");
		expect(out).not.toMatch(/fall back to doing the work directly/);
	});

	it("includes optional mode-specific extraRules when provided", () => {
		const out = buildDelegateEverythingSection({
			modeName: "TEAM",
			dispatchTool: "dispatch_agent",
			dispatchExample: 'dispatch_agent { agent: "scout", task: "..." }',
			extraRules: ["Builders are responsible for code changes."],
		});
		expect(out).toContain("Mode-Specific Rules");
		expect(out).toContain("Builders are responsible for code changes.");
	});

	it("omits the Mode-Specific Rules block when no extraRules are provided", () => {
		const out = buildDelegateEverythingSection({
			modeName: "CHAIN",
			dispatchTool: "run_chain",
			dispatchExample: "run_chain { task: \"...\" }",
		});
		expect(out).not.toContain("Mode-Specific Rules");
	});
});

describe("Delegate-Everything Policy — wired into every operational-mode prompt", () => {
	const NORMAL_PROMPT = buildNormalPrompt({
		commanderAvailable: true,
		activeChain: null,
		activePipeline: null,
		scoutId: null,
		selectedAdvisorModel: null,
	});

	it("NORMAL prompt contains the delegate-everything heading", () => {
		expect(NORMAL_PROMPT).toContain("Delegate Everything Policy (REQUIRED)");
	});

	it("PLAN prompt contains the delegate-everything heading", () => {
		expect(PLAN_PROMPT).toContain("Delegate Everything Policy (REQUIRED)");
	});

	it("INVESTIGATE prompt contains the delegate-everything heading", () => {
		expect(INVESTIGATE_PROMPT).toContain("Delegate Everything Policy (REQUIRED)");
	});

	it("SPEC prompt contains the delegate-everything heading", () => {
		expect(SPEC_PROMPT).toContain("Delegate Everything Policy (REQUIRED)");
	});

	it("NORMAL prompt no longer instructs the main agent to fall back to doing the work directly", () => {
		expect(NORMAL_PROMPT).not.toMatch(/fall back to doing the work directly/);
	});

	it("NORMAL prompt no longer says 'You CAN still use Bash for running tests'", () => {
		expect(NORMAL_PROMPT).not.toContain("You CAN still use Bash for running tests");
	});

	it("PLAN prompt does not contain the old 'fall back to doing the work directly' carve-out", () => {
		expect(PLAN_PROMPT).not.toMatch(/fall back to doing the work directly/);
	});

	it("INVESTIGATE prompt does not contain the old 'fall back to doing the work directly' carve-out", () => {
		expect(INVESTIGATE_PROMPT).not.toMatch(/fall back to doing the work directly/);
	});

	it("SPEC prompt does not contain the old 'fall back to doing the work directly' carve-out", () => {
		expect(SPEC_PROMPT).not.toMatch(/fall back to doing the work directly/);
	});

	it("NORMAL prompt's mode-selection guidance no longer says 'work directly in NORMAL, do NOT call set_mode'", () => {
		expect(NORMAL_PROMPT).not.toContain("work directly in NORMAL, do NOT call set_mode");
	});
});
