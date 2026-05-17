// ABOUTME: Source-level regression tests for the agent-team task widget.
// ABOUTME: Confirms stale Mission Complete compatibility flags cannot create a visible summary widget.

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const agentTeamSource = readFileSync(join(__dirname, "..", "agent-team.ts"), "utf-8");
const tasksSource = readFileSync(join(__dirname, "..", "tasks.ts"), "utf-8");

describe("agent-team after completion-summary widget removal", () => {
	it("keeps the agent-team refresh hook for normal task updates", () => {
		expect(agentTeamSource).toContain("__piRefreshAgentTeamWidget");
		expect(agentTeamSource).toContain("__piRefreshAgentTeamWidget = () => updateWidget();");
	});

	it("does not have an active tasks-side Mission Complete widget publisher", () => {
		expect(tasksSource).toContain("g.__piMissionCompleteVisible = false;");
		expect(tasksSource).toContain("g.__piCompletedTaskUiDismissed = false;");
		expect(tasksSource).not.toContain("function publishMissionCompleteVisibility");
		expect(tasksSource).not.toContain("publishMissionCompleteVisibility(true)");
		expect(tasksSource).not.toContain('setWidget("mission-complete"');
	});

	it("keeps task-list navigation available because the completion widget is no longer shown", () => {
		expect(tasksSource).not.toContain("publishCompletedTaskUiDismissed(true)");
		expect(tasksSource).not.toContain("clearTransientTaskWidgets");
	});
});
