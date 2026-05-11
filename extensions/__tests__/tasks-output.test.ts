// ABOUTME: Tests for tasks extension output formatting.
// ABOUTME: Verifies no Unicode emojis in output and correct customType naming.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const tasksSource = readFileSync(join(__dirname, "..", "tasks.ts"), "utf-8");

describe("mission complete lifecycle", () => {
	it("persists mission complete while tasks remain done", () => {
		expect(tasksSource).not.toContain("MISSION_COMPLETE_DISMISS_MS");
		expect(tasksSource).not.toContain("setTimeout(() => {\n\t\t\tctx.ui.setWidget(\"mission-complete\", undefined);");
		expect(tasksSource).toContain("let missionCompleteVisible = false;");
		expect(tasksSource).toContain("publishMissionCompleteVisibility(true);");
	});

	it("publishes mission complete visibility for replacement UI", () => {
		expect(tasksSource).toContain("function publishMissionCompleteVisibility(visible: boolean)");
		expect(tasksSource).toContain("g.__piMissionCompleteVisible = visible;");
		expect(tasksSource).toContain("publishMissionCompleteVisibility(true);");
		expect(tasksSource).toContain("publishMissionCompleteVisibility(false);");
		expect(tasksSource).toContain('ctx.ui.setWidget("agent-team", undefined);');
		expect(tasksSource).toContain("__piRefreshAgentTeamWidget?.();");
	});

	it("refreshes the active task widget whenever task state is published", () => {
		const refreshWidgetSection = tasksSource.slice(
			tasksSource.indexOf("const refreshWidget"),
			tasksSource.indexOf("const refreshUI"),
		);
		expect(refreshWidgetSection).toContain("publishCurrentTask(tasks, syncState, listTitle, listDescription);");
		expect(refreshWidgetSection).toContain("__piRefreshAgentTeamWidget?.();");
	});

	it("hides mission complete when tasks become active or incomplete again", () => {
		expect(tasksSource).toContain('tasks.some((t) => t.status !== "done")');
		// Verify the core mission-complete flow: when all done, show mission complete
		const checkMissionSection = tasksSource.slice(
			tasksSource.indexOf("function checkMissionComplete"),
			tasksSource.indexOf("// ── State reconstruction from session"),
		);
		expect(checkMissionSection).toContain("const allDone = tasks.every(t => t.status === \"done\")");
		expect(checkMissionSection).toContain("if (allDone) {");
		expect(checkMissionSection).toContain("showMissionComplete(ctx);");
	});

	it("does not dismiss mission complete on ordinary user input", () => {
		const inputSection = tasksSource.slice(
			tasksSource.indexOf('pi.on("input"'),
			tasksSource.indexOf("// ── Register tasks tool"),
		);
		expect(inputSection).not.toContain("dismissMissionComplete");
	});

	it("clears mission complete when starting a new list or clearing tasks", () => {
		expect(tasksSource).toContain("dismissMissionComplete(ctx);\n\n\t\t\t\t\t// Cancel any previously synced tasks before resetting");
		expect(tasksSource).toContain("dismissMissionComplete(ctx);\n\t\t\t\t\tconst count = tasks.length;");
	});

	it("audits Commander board state when mission complete is shown", () => {
		expect(tasksSource).toContain("function auditCommanderBoardForMissionComplete()");
		expect(tasksSource).toContain("auditCommanderBoardForMissionComplete();");
		expect(tasksSource).toContain('client.callTool("commander_task"');
		expect(tasksSource).toContain('status: localToCommander(task.status)');
	});

	it("reminds agents to check local tasks and Commander board before stopping", () => {
		expect(tasksSource).toContain("function getPreStopTaskAudit()");
		expect(tasksSource).toContain("Commander board sync still needs verification");
		expect(tasksSource).toContain("Before stopping, verify/update the Commander board");
		expect(tasksSource).toContain("Don't stop until local tasks and any Commander board updates are complete!");
	});

	it("guards explicit self-cleanup as a stop/stomper path", () => {
		expect(tasksSource).toContain("function shouldGuardSelfCleanup");
		expect(tasksSource).toContain('operation === "cleanup:self"');
		expect(tasksSource).toContain("Before cleanup/self-stop");
	});

	it("treats list descriptions as rich work summaries", () => {
		expect(tasksSource).toContain("rich 1-3 sentence work summary");
		expect(tasksSource).toContain("Work Summary: ${listDescription}");
		expect(tasksSource).toContain('theme.fg("accent", "Work Summary:")');
		expect(tasksSource).toContain("summary: listDescription");
	});

	it("supports interim completion messaging for investigation-style handoffs", () => {
		expect(tasksSource).toContain("function inferCompletionPresentation()");
		expect(tasksSource).toContain("variant: \"interim\"");
		expect(tasksSource).toContain("UP NEXT: ${completion.nextStep}");
		expect(tasksSource).toContain("Task complete -- ${listTitle || \"Tasks\"}");
		expect(tasksSource).toContain("Review the findings/plan and continue with the next approved implementation step.");
	});
});

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
