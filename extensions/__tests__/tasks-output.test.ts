// ABOUTME: Tests for tasks extension output formatting.
// ABOUTME: Verifies no Unicode emojis in output and that removed summary widgets stay disabled.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const tasksSource = readFileSync(join(__dirname, "..", "tasks.ts"), "utf-8");

describe("removed completion summary widget", () => {
	// structural — negative wiring guard: ensures the removed mission-complete widget renderer has not crept back into tasks.ts. There is no behavior to call.
	it("does not register the mission-complete widget or import its renderer", () => {
		expect(tasksSource).not.toContain('setWidget("mission-complete"');
		expect(tasksSource).not.toContain("mission-complete-render");
		expect(tasksSource).not.toContain("renderMissionComplete");
		expect(tasksSource).not.toContain("MISSION_COMPLETE_DISMISS_MS");
		expect(tasksSource).not.toContain("showMissionComplete(ctx)");
	});

	// structural — checkMissionComplete and runCompletionSideEffects live inside the default-exported extension closure in tasks.ts and are not importable; this guards their wiring.
	it("still runs non-UI completion side effects when all tasks are done", () => {
		const checkMissionSection = tasksSource.slice(
			tasksSource.indexOf("function checkMissionComplete"),
			tasksSource.indexOf("// ── State reconstruction from session"),
		);
		expect(checkMissionSection).toContain('const allDone = tasks.every(t => t.status === "done")');
		expect(checkMissionSection).toContain("if (allDone) {");
		expect(checkMissionSection).toContain("runCompletionSideEffects();");
		expect(tasksSource).toContain("function closeCommanderParentIfAllLocalTasksDone()");
		expect(tasksSource).toContain('syncToCommander("mission-complete"');
	});

	// structural — refreshUI is a closure-scoped lambda inside the extension default export; this guards its wiring (no widget set, no destructive task-state writes).
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

	// structural — auditCommanderBoardForMissionComplete is closure-scoped; this guards that the audit is registered and dispatches the expected cmd op shape.
	it("audits Commander board state as a completion side effect", () => {
		expect(tasksSource).toContain("function auditCommanderBoardForMissionComplete()");
		expect(tasksSource).toContain("auditCommanderBoardForMissionComplete();");
		expect(tasksSource).toContain('client.callTool("commander_task"');
		expect(tasksSource).toContain("status: localToCommander(task.status)");
	});

	// structural — getPreStopTaskAudit is closure-scoped; this guards the human-readable strings the audit surfaces to the agent.
	it("reminds agents to check local tasks and Commander board before stopping", () => {
		expect(tasksSource).toContain("function getPreStopTaskAudit()");
		expect(tasksSource).toContain("Commander board sync still needs verification");
		expect(tasksSource).toContain("Before stopping, verify/update the Commander board");
		expect(tasksSource).toContain("Don't stop until local tasks and any Commander board updates are complete!");
	});

	// structural — guards that tasks.ts wires the exported helpers (addPendingCreate/addPendingCreates) and surfaces the unresolved-id warning. Helper behavior is covered in commander-sync.test.ts.
	it("tracks pending Commander creates so done local tasks cannot hide unmapped CMD work", () => {
		expect(tasksSource).toContain('addPendingCreates(syncState, initialTasks, "group")');
		expect(tasksSource).toContain("addPendingCreate(syncState, task");
		expect(tasksSource).toContain("syncState.pendingCreates || []");
		expect(tasksSource).toContain("Commander sync still has ${unresolvedIds.length} unresolved local task(s)");
		expect(tasksSource).not.toContain("tasks are dropped");
	});

	// structural — guards the source-text shape of the error-handling contract inside executeGroupCreate; behavior is covered by commander-sync-execute-group-create.test.ts (per the inline comment below).
	it("clears stuck group-create state after failed Commander group sync", () => {
		// The error-handling contract (settle on failure + re-throw) lives in
		// executeGroupCreate inside commander-sync.ts since Phase 1 consolidation.
		// Behavior is covered by commander-sync-execute-group-create.test.ts; this
		// guards the source-text shape so an accidental delete is noisy.
		const syncSource = readFileSync(
			join(__dirname, "..", "lib", "commander", "commander-sync.ts"),
			"utf-8",
		);
		expect(syncSource).toContain("markGroupCreateSettled(getState())");
		expect(syncSource).toContain('client.callTool("commander_task", payload, 30_000)');
		expect(syncSource).toMatch(/catch\s*\(err[^)]*\)/);
		expect(syncSource).toContain("throw err;");
		// Both call sites in tasks.ts route through the helper, not inline lambdas.
		const helperCallSites = (tasksSource.match(/executeGroupCreate\(\{/g) || []).length;
		expect(helperCallSites).toBeGreaterThanOrEqual(2);
	});

	// structural — shouldSyncLocalTasksToCommander/commanderSyncSuppressedMessage are closure-scoped; this guards the wiring that imports resolveCommanderTaskSyncPolicyFromEnv (which IS independently behaviorally tested in commander-task-sync-policy.test.ts).
	it("promotes local tasks through the shared Commander sync policy", () => {
		expect(tasksSource).toContain("resolveCommanderTaskSyncPolicyFromEnv");
		expect(tasksSource).toContain("function shouldSyncLocalTasksToCommander()");
		expect(tasksSource).toContain("function commanderSyncSuppressedMessage()");
		expect(tasksSource).toContain("__commanderSyncEnabled");
		expect(tasksSource).toContain("Every Commander board task you create or claim is your responsibility");
		expect(tasksSource).not.toContain("Local WARDEN task list not promoted to Commander");
	});

	// structural — shouldGuardSelfCleanup is closure-scoped; this guards the predicate's wiring and the human-readable nudge string.
	it("guards explicit self-cleanup as a stop/stomper path", () => {
		expect(tasksSource).toContain("function shouldGuardSelfCleanup");
		expect(tasksSource).toContain('operation === "cleanup:self"');
		expect(tasksSource).toContain("Before cleanup/self-stop");
	});

	// structural — guards the template strings used by the list-description "rich work summary" UX; the strings are inlined in the tool execute() closure.
	it("treats list descriptions as rich work summaries", () => {
		expect(tasksSource).toContain("rich 1-3 sentence work summary");
		expect(tasksSource).toContain("Work Summary: ${listDescription}");
		expect(tasksSource).toContain('theme.fg("accent", "Work Summary:")');
		expect(tasksSource).toContain("listDescription");
	});

	// structural — inferCompletionPresentation is closure-scoped; this guards its detection keywords and the interim-completion strings.
	it("supports interim completion context for investigation-style handoffs", () => {
		expect(tasksSource).toContain("function inferCompletionPresentation()");
		expect(tasksSource).toContain('variant: "interim"');
		expect(tasksSource).toContain("UP NEXT: ${completion.nextStep}");
		expect(tasksSource).toContain('Task complete -- ${listTitle || "Tasks"}');
		expect(tasksSource).toContain("Review the findings/plan and continue with the next approved implementation step.");
	});

	// structural — negative wiring + positive wiring for the closure-scoped mission-complete snapshot template.
	it("records mission completion as a non-conversational snapshot without per-task rows", () => {
		expect(tasksSource).not.toContain("const taskSummary = tasks");
		expect(tasksSource).not.toContain("[x] #${t.id}");
		expect(tasksSource).not.toContain("${taskSummary}");

		const missionMsgStart = tasksSource.indexOf("// All tasks done — persist a non-conversational completion snapshot.");
		const missionMsgEnd = tasksSource.indexOf("// Incomplete tasks remain — nudge the agent", missionMsgStart);
		expect(missionMsgStart).toBeGreaterThan(-1);
		expect(missionMsgEnd).toBeGreaterThan(missionMsgStart);
		const missionMsgSection = tasksSource.slice(missionMsgStart, missionMsgEnd);
		expect(missionMsgSection).toContain("completionPrefix");
		expect(missionMsgSection).toContain("${summaryLine}");
		expect(missionMsgSection).toContain("${reportHint}");
		expect(missionMsgSection).toContain('pi.appendEntry("mission-complete"');
		expect(missionMsgSection).not.toContain('customType: "mission-complete"');
	});

	// structural — repeated agent_end after all tasks are done must be a no-op for the same completed task-list signature.
	it("guards mission-complete snapshots so repeated agent_end cannot loop acknowledgements", () => {
		expect(tasksSource).toContain("let missionCompleteSentSignature: string | undefined;");
		expect(tasksSource).toContain("function buildMissionCompleteSignature()");
		expect(tasksSource).toContain("function resetMissionCompleteSnapshot()");
		const missionMsgStart = tasksSource.indexOf("// All tasks done — persist a non-conversational completion snapshot.");
		const missionMsgEnd = tasksSource.indexOf("// Incomplete tasks remain — nudge the agent", missionMsgStart);
		const missionMsgSection = tasksSource.slice(missionMsgStart, missionMsgEnd);
		expect(missionMsgSection).toContain("const completionSignature = buildMissionCompleteSignature();");
		expect(missionMsgSection).toContain("if (missionCompleteSentSignature === completionSignature) return;");
		expect(missionMsgSection).toContain("missionCompleteSentSignature = completionSignature;");
	});

	// structural — adding/changing work must re-arm the completion snapshot once the new work is done; plain input must not.
	it("resets the mission-complete guard only when task state changes", () => {
		expect(tasksSource).toContain("resetMissionCompleteSnapshot();");
		expect(tasksSource).not.toContain("pi.on(\"input\", async (_event, _ctx) => {\n\t\tresetMissionCompleteSnapshot();");
	});
});

describe("tasks output formatting", () => {
	const BANNED_EMOJIS = ["✓", "●", "○", "⟳", "✕"];

	// structural — source-level lint guard against banned Unicode glyphs; tasks.ts does not export a function that emits the icon set in isolation.
	it("should not contain any Unicode emoji characters", () => {
		for (const emoji of BANNED_EMOJIS) {
			expect(tasksSource).not.toContain(emoji);
		}
	});

	// structural — STATUS_ICON is a closure-scoped constant; the renderer that consumes it is also closure-scoped, so this guards the constant shape directly.
	it("should use text-based STATUS_ICON values", () => {
		expect(tasksSource).toMatch(/idle:\s*"-"/);
		expect(tasksSource).toMatch(/inprogress:\s*"\*"/);
		expect(tasksSource).toMatch(/done:\s*"x"/);
	});

	// structural — guards the customType string the closure sends via pi.sendMessage; the string is inlined and not exported.
	it('should use customType "task-validation" instead of "tasks-nudge"', () => {
		expect(tasksSource).not.toContain("tasks-nudge");
		expect(tasksSource).toContain("task-validation");
	});

	// structural — ABOUTME comments are documentation, not behavior; this guards the file header per the CLAUDE.md convention.
	it("should mention task validation in ABOUTME comment", () => {
		const aboutmeLines = tasksSource.split("\n").slice(0, 3);
		const aboutme = aboutmeLines.join("\n");
		expect(aboutme).toContain("task validation");
		expect(aboutme).not.toContain("completion nudges");
	});
});
