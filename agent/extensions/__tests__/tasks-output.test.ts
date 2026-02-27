// ABOUTME: Tests for tasks extension output formatting.
// ABOUTME: Verifies no Unicode emojis in output and correct customType naming.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const tasksSource = readFileSync(join(__dirname, "..", "tasks.ts"), "utf-8");

describe("tasks output formatting", () => {
	const BANNED_EMOJIS = ["✓", "●", "○", "⟳", "✕"];

	it("should not contain any Unicode emoji characters", () => {
		for (const emoji of BANNED_EMOJIS) {
			expect(tasksSource).not.toContain(emoji);
		}
	});

	it("should use text-based STATUS_ICON values", () => {
		expect(tasksSource).toMatch(/idle:\s*"-"/);
		expect(tasksSource).toMatch(/inprogress:\s*"\*"/);
		expect(tasksSource).toMatch(/done:\s*"x"/);
	});

	it('should use customType "task-validation" instead of "tasks-nudge"', () => {
		expect(tasksSource).not.toContain("tasks-nudge");
		expect(tasksSource).toContain("task-validation");
	});

	it("should mention task validation in ABOUTME comment", () => {
		const aboutmeLines = tasksSource.split("\n").slice(0, 3);
		const aboutme = aboutmeLines.join("\n");
		expect(aboutme).toContain("task validation");
		expect(aboutme).not.toContain("completion nudges");
	});
});
