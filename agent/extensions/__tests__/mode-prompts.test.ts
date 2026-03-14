// ABOUTME: Tests for PLAN and SPEC system prompt templates.
// ABOUTME: Validates that prompts contain expected keywords for their workflows.

import { describe, it, expect } from "vitest";
import { PLAN_PROMPT, SPEC_PROMPT } from "../lib/mode-prompts.ts";

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

describe("SPEC_PROMPT — Commander-first enforcement", () => {
	it("contains 'ALWAYS' for Commander usage", () => {
		expect(SPEC_PROMPT).toContain("ALWAYS");
	});
});

describe("SPEC_PROMPT", () => {
	it("is a non-empty string", () => {
		expect(typeof SPEC_PROMPT).toBe("string");
		expect(SPEC_PROMPT.length).toBeGreaterThan(0);
	});

	it("contains 'context-os'", () => {
		expect(SPEC_PROMPT.toLowerCase()).toContain("context-os");
	});

	it("contains 'spec'", () => {
		expect(SPEC_PROMPT.toLowerCase()).toContain("spec");
	});

	it("contains 'requirements.md'", () => {
		expect(SPEC_PROMPT).toContain("requirements.md");
	});

	it("contains 'commander_mailbox'", () => {
		expect(SPEC_PROMPT).toContain("commander_mailbox");
	});
});
