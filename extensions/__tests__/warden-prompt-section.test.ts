// ABOUTME: Tests for the shared WARDEN task-confirmation prompt helper.
// ABOUTME: Ensures WARDEN uses the existing tasks tool without rebranding tasklist UI.

import { describe, it, expect } from "vitest";
import { buildWardenTaskConfirmationSection } from "../lib/warden-prompt-section.ts";

describe("buildWardenTaskConfirmationSection", () => {
	it("contains the WARDEN task-confirmation contract", () => {
		const result = buildWardenTaskConfirmationSection("PLAN");

		expect(result).toContain("WARDEN");
		expect(result).toContain("Task Confirmation");
		expect(result).toContain("tasks new-list");
		expect(result).toContain("tasks add");
		expect(result).toContain("tasks toggle");
		expect(result).toContain("inprogress");
		expect(result).toContain("done");
		expect(result.toLowerCase()).toContain("continue");
	});

	it("states that WARDEN does not rename the existing tasks tool or tasklist UI", () => {
		const result = buildWardenTaskConfirmationSection("NORMAL");

		expect(result).toContain("does **not** rename");
		expect(result).toContain("existing `tasks` tool");
		expect(result).toContain("tasklist UI");
		expect(result).not.toContain("/warden");
	});

	it("includes mode-specific guardrails when provided", () => {
		const result = buildWardenTaskConfirmationSection("SPEC", {
			sliceName: "spec document slice",
			guardrails: ["Do not implement before spec approval.", "Keep requirements.md, design.md, and tasks.md aligned."],
		});

		expect(result).toContain("spec document slice");
		expect(result).toContain("Do not implement before spec approval.");
		expect(result).toContain("requirements.md, design.md, and tasks.md");
	});
});
