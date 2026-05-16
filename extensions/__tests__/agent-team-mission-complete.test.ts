// ABOUTME: Source-level regression tests for agent-team task widget replacement.
// ABOUTME: Ensures Mission Complete hides the regular task section while visible.

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const source = readFileSync(join(__dirname, "..", "agent-team.ts"), "utf-8");

describe("agent-team Mission Complete replacement", () => {
	it("checks the global Mission Complete visibility flag only when all tasks are complete", () => {
		expect(source).toContain("__piMissionCompleteVisible");
		expect(source).toContain("const allTasksComplete = !!taskList?.tasks?.length && taskList.tasks.every((task) => task.status === \"done\");");
		expect(source).toContain("const missionCompleteVisible = !!(globalThis as any).__piMissionCompleteVisible && allTasksComplete;");
	});

	it("clears the regular task widget while Mission Complete is visible", () => {
		expect(source).toContain('if (missionCompleteVisible) {\n\t\t\twidgetCtx.ui.setWidget("agent-team", undefined);');
		expect(source).toContain("} else if (taskList && taskList.tasks.length > 0) {");
	});

	it("exposes a refresh hook so Mission Complete can immediately hide the task widget", () => {
		expect(source).toContain("__piRefreshAgentTeamWidget");
		expect(source).toContain("__piRefreshAgentTeamWidget = () => updateWidget();");
	});

	it("disables task-list navigation while Mission Complete replaces the task section", () => {
		expect(source).toContain("if ((globalThis as any).__piMissionCompleteVisible) return false;");
	});
});
