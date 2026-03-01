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

	it("contains 'commander_session'", () => {
		expect(PLAN_PROMPT).toContain("commander_session");
	});

	it("contains 'file:open'", () => {
		expect(PLAN_PROMPT).toContain("file:open");
	});

	it("contains '.context/todo.md'", () => {
		expect(PLAN_PROMPT).toContain(".context/todo.md");
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

	it("contains 'AskUserQuestion'", () => {
		expect(SPEC_PROMPT).toContain("AskUserQuestion");
	});

	it("contains 'requirements.md'", () => {
		expect(SPEC_PROMPT).toContain("requirements.md");
	});

	it("contains 'commander_session'", () => {
		expect(SPEC_PROMPT).toContain("commander_session");
	});

	it("contains 'file:open'", () => {
		expect(SPEC_PROMPT).toContain("file:open");
	});
});
