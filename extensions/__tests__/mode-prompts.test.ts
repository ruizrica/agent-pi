// ABOUTME: Tests for PLAN and SPEC system prompt templates.
// ABOUTME: Validates that prompts contain expected keywords for their workflows.

import { describe, it, expect } from "vitest";
import { INVESTIGATE_PROMPT, PLAN_PROMPT, SPEC_PROMPT } from "../lib/mode-prompts.ts";

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
