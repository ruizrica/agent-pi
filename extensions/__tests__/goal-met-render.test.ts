// ABOUTME: Tests for the GOAL MET terminal widget renderer.
// ABOUTME: Verifies compact CLI/TUI completion output without browser UI dependencies.

import { describe, expect, it } from "vitest";
import { renderGoalMet, type GoalMetTheme } from "../lib/goal-met-render.ts";

const theme: GoalMetTheme = {
	fg: (_color, text) => text,
	bold: (text) => text,
};

describe("renderGoalMet", () => {
	it("renders goal, condition, summary, evidence, and next steps", () => {
		const result = renderGoalMet({
			goal: "Ship GOAL mode",
			successCondition: "GOAL MET appears in the terminal",
			summary: "The loop completed successfully.",
			evidence: ["Mode is selectable", "Widget rendered"],
			nextSteps: ["Run full tests"],
			completedAt: Date.now(),
			iterations: 3,
		}, 100, theme);

		const joined = result.lines.join("\n");
		expect(joined).toContain("GOAL MET");
		expect(joined).toContain("Ship GOAL mode");
		expect(joined).toContain("GOAL MET appears in the terminal");
		expect(joined).toContain("The loop completed successfully.");
		expect(joined).toContain("Mode is selectable");
		expect(joined).toContain("Run full tests");
		expect(joined).toContain("3 iterations");
	});

	it("omits empty optional sections", () => {
		const result = renderGoalMet({
			goal: "Minimal goal",
			successCondition: "Condition met",
			completedAt: Date.now(),
		}, 80, theme);

		const joined = result.lines.join("\n");
		expect(joined).toContain("GOAL MET");
		expect(joined).toContain("Success Condition:");
		expect(joined).not.toContain("Summary:");
		expect(joined).not.toContain("Evidence:");
		expect(joined).not.toContain("Next Steps:");
	});

	it("wraps long content to fit narrow terminals", () => {
		const result = renderGoalMet({
			goal: "Narrow terminal",
			successCondition: "This is a deliberately long success condition that should wrap across several terminal lines without exceeding the requested width.",
			summary: "This summary should also wrap cleanly in the terminal widget.",
			evidence: ["This evidence item is long enough to require wrapping within the terminal card."],
			completedAt: Date.now(),
		}, 52, theme);

		for (const line of result.lines.filter(Boolean)) {
			expect(line.length).toBeLessThanOrEqual(52);
		}
	});
});
