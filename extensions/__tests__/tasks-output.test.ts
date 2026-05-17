// ABOUTME: Tests for tasks extension output formatting.
// ABOUTME: Verifies no Unicode emojis in output and that removed summary widgets stay disabled.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const tasksSource = readFileSync(join(__dirname, "..", "tasks.ts"), "utf-8");

describe("removed completion summary widget", () => {
	it("does not register the mission-complete widget or import its renderer", () => {
		expect(tasksSource).not.toContain('setWidget("mission-complete"');
		expect(tasksSource).not.toContain("mission-complete-render");
		expect(tasksSource).not.toContain("renderMissionComplete");
		expect(tasksSource).not.toContain("MISSION_COMPLETE_DISMISS_MS");
		expect(tasksSource).not.toContain("showMissionComplete(ctx)");
	});

	it("still runs non-UI completion side effects when all tasks are done", () => {
		const checkMissionSection = tasksSource.slice(
			tasksSource.indexOf("function checkMissionComplete"),
			tasksSource.indexOf("// ── State reconstruction from session"),
		);
		expect(checkMissionSection).toContain('const allDone = tasks.every(t => t.status === "done")');
		expect(checkMissionSection).toContain("if (allDone) {");
		expect(checkMissionSection).toContain("runCompletionSideEffects();");
		expect(checkMissionSection).toContain('syncToCommander("mission-complete"');
	});

	it("keeps task overlay cleanup before viewer tools without touching task state", () => {
		const refreshSection = tasksSource.slice(
			tasksSource.indexOf("const refreshUI"),
			tasksSource.indexOf("// ── Completion side effects"),
		);
		expect(refreshSection).toContain('ctx.ui.setWidget("tasks-list", undefined);');
		expect(refreshSection).not.toContain('setWidget("mission-complete"');
		expect(refreshSection).not.toContain("tasks = []");
		expect(refreshSection).not.toContain("clearMappings");
	});

	it("audits Commander board state as a completion side effect", () => {
		expect(tasksSource).toContain("function auditCommanderBoardForMissionComplete()");
		expect(tasksSource).toContain("auditCommanderBoardForMissionComplete();");
		expect(tasksSource).toContain('client.callTool("commander_task"');
		expect(tasksSource).toContain("status: localToCommander(task.status)");
	});

	it("reminds agents to check local tasks and Commander board before stopping", () => {
		expect(tasksSource).toContain("function getPreStopTaskAudit()");
		expect(tasksSource).toContain("Commander board sync still needs verification");
		expect(tasksSource).toContain("Before stopping, verify/update the Commander board");
		expect(tasksSource).toContain("Don't stop until local tasks and any Commander board updates are complete!");
	});

	it("tracks pending Commander creates so done local tasks cannot hide unmapped CMD work", () => {
		expect(tasksSource).toContain('addPendingCreates(syncState, initialTasks, "group")');
		expect(tasksSource).toContain("addPendingCreate(syncState, task");
		expect(tasksSource).toContain("syncState.pendingCreates || []");
		expect(tasksSource).toContain("Commander sync still has ${unresolvedIds.length} unresolved local task(s)");
		expect(tasksSource).not.toContain("tasks are dropped");
	});

	it("clears stuck group-create state after failed Commander group sync", () => {
		expect(tasksSource).toContain("markGroupCreateSettled(syncState)");
		expect(tasksSource).toContain('client.callTool("commander_task", payload, 30_000)');
		expect(tasksSource).toContain("catch (err)");
		expect(tasksSource).toContain("throw err;");
	});

	it("suppresses local WARDEN board sync through the shared ownership policy", () => {
		expect(tasksSource).toContain("resolveCommanderTaskSyncPolicyFromEnv");
		expect(tasksSource).toContain("function shouldSyncLocalTasksToCommander()");
		expect(tasksSource).toContain("function commanderSyncSuppressedMessage()");
		expect(tasksSource).toContain("__commanderSyncEnabled");
		expect(tasksSource).toContain("Every Commander board task you create or claim is your responsibility");
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
		expect(tasksSource).toContain("listDescription");
	});

	it("supports interim completion context for investigation-style handoffs", () => {
		expect(tasksSource).toContain("function inferCompletionPresentation()");
		expect(tasksSource).toContain('variant: "interim"');
		expect(tasksSource).toContain("UP NEXT: ${completion.nextStep}");
		expect(tasksSource).toContain('Task complete -- ${listTitle || "Tasks"}');
		expect(tasksSource).toContain("Review the findings/plan and continue with the next approved implementation step.");
	});

	it("does not enumerate per-task rows in the hidden completion agent message", () => {
		expect(tasksSource).not.toContain("const taskSummary = tasks");
		expect(tasksSource).not.toContain("[x] #${t.id}");
		expect(tasksSource).not.toContain("${taskSummary}");

		const missionMsgStart = tasksSource.indexOf("// All tasks done — inject rich completion context");
		const missionMsgEnd = tasksSource.indexOf("// Incomplete tasks remain — nudge the agent", missionMsgStart);
		expect(missionMsgStart).toBeGreaterThan(-1);
		expect(missionMsgEnd).toBeGreaterThan(missionMsgStart);
		const missionMsgSection = tasksSource.slice(missionMsgStart, missionMsgEnd);
		expect(missionMsgSection).toContain("completionPrefix");
		expect(missionMsgSection).toContain("${summaryLine}");
		expect(missionMsgSection).toContain("${reportHint}");
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
