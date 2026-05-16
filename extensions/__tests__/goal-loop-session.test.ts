// ABOUTME: Tests for GOAL loop session markdown helpers.
// ABOUTME: Verifies durable state formatting for objective-driven loops.

import { describe, expect, it } from "vitest";
import {
	appendGoalMetMarkdown,
	goalInitialMarkdown,
	slugifyGoal,
	upsertGoalSection,
} from "../lib/goal-loop-session.ts";

describe("goal loop session helpers", () => {
	it("slugifies goal names safely", () => {
		expect(slugifyGoal("Ship GOAL Mode!" )).toBe("ship-goal-mode");
		expect(slugifyGoal("***")).toBe("goal-loop");
	});

	it("creates initial markdown with goal-specific sections", () => {
		const md = goalInitialMarkdown({
			goal: "Ship GOAL mode",
			successCondition: "A terminal GOAL MET card appears",
			successCriteria: ["Mode is selectable", "Loop state persists"],
			constraints: ["No browser UI"],
		});

		expect(md).toContain("# GOAL Session");
		expect(md).toContain("## Goal\nShip GOAL mode");
		expect(md).toContain("## Success Condition\nA terminal GOAL MET card appears");
		expect(md).toContain("- Mode is selectable");
		expect(md).toContain("- No browser UI");
		expect(md).toContain("## Next Slice");
	});

	it("upserts only the requested section", () => {
		const md = "# GOAL Session\n\n## Current Progress\n- Old\n\n## Risks\n- Existing risk\n";
		const updated = upsertGoalSection(md, "Current Progress", "- New");

		expect(updated).toContain("## Current Progress\n- New");
		expect(updated).toContain("## Risks\n- Existing risk");
		expect(updated).not.toContain("- Old");
	});

	it("adds GOAL MET completion details", () => {
		const md = goalInitialMarkdown({ goal: "Finish", successCondition: "Done" });
		const updated = appendGoalMetMarkdown(md, {
			goal: "Finish",
			successCondition: "Done",
			summary: "Everything passed.",
			evidence: ["Tests passed"],
			nextSteps: ["Celebrate"],
		});

		expect(updated).toContain("## Condition Status\n- Met");
		expect(updated).toContain("## GOAL MET");
		expect(updated).toContain("- Summary: Everything passed.");
		expect(updated).toContain("- Tests passed");
		expect(updated).toContain("- Celebrate");
	});
});
