// ABOUTME: Tests for parent task completion on mission-complete.
// ABOUTME: Verifies that when all children are done, the initiative-root parent is updated to completed.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { emptySyncState, type SyncState } from "../lib/commander/commander-sync.ts";

// closeCommanderParentIfAllLocalTasksDone lives inside the default-exported
// extension closure in tasks.ts (no isolated export), so its assertions remain
// source-text checks. Read tasks.ts once for those structural guards.
const tasksSource = readFileSync(join(__dirname, "..", "tasks.ts"), "utf-8");

describe("parent task completion on mission-complete", () => {
	// structural — asserts wiring inside the closure-scoped closeCommanderParentIfAllLocalTasksDone(); behavior covered indirectly by commander-sync state helpers.
	it("calls syncToCommander with mission-complete label when all tasks are done", () => {
		const checkMissionCompleteSection = tasksSource.slice(
			tasksSource.indexOf("function closeCommanderParentIfAllLocalTasksDone()"),
			tasksSource.indexOf("// ── State reconstruction from session"),
		);
		expect(checkMissionCompleteSection).toContain('syncToCommander("mission-complete"');
	});

	// structural — asserts the cmd payload shape emitted by the closure-scoped helper.
	it("sends commander_task update with operation update and status completed", () => {
		const checkMissionCompleteSection = tasksSource.slice(
			tasksSource.indexOf("function closeCommanderParentIfAllLocalTasksDone()"),
			tasksSource.indexOf("// ── State reconstruction from session"),
		);
		expect(checkMissionCompleteSection).toContain('operation: "update"');
		expect(checkMissionCompleteSection).toContain('status: "completed"');
		expect(checkMissionCompleteSection).toContain('task_id: syncState.groupId');
	});

	// structural — asserts the double-firing guard inside the closure-scoped helper.
	it("guards against double-firing with parentClosedAt flag", () => {
		const checkMissionCompleteSection = tasksSource.slice(
			tasksSource.indexOf("function closeCommanderParentIfAllLocalTasksDone()"),
			tasksSource.indexOf("// ── State reconstruction from session"),
		);
		expect(checkMissionCompleteSection).toContain("syncState.parentClosedAt");
		expect(checkMissionCompleteSection).toContain("parentClosedAt: Date.now()");
	});

	// structural — asserts the groupId precondition inside the closure-scoped helper.
	it("only fires parent-complete if groupId is defined", () => {
		const checkMissionCompleteSection = tasksSource.slice(
			tasksSource.indexOf("function closeCommanderParentIfAllLocalTasksDone()"),
			tasksSource.indexOf("// ── State reconstruction from session"),
		);
		expect(checkMissionCompleteSection).toContain("syncState.groupId === undefined");
	});

	// structural — asserts that the `case "clear":` branch resets parentClosedAt; the branch lives inline in the tool execute() closure.
	it("resets parentClosedAt when clearing the task list", () => {
		const clearStartIdx = tasksSource.indexOf('case "clear":', tasksSource.indexOf('execute(_toolCallId'));
		const clearSection = tasksSource.slice(
			clearStartIdx,
			clearStartIdx + 1500,
		);
		expect(clearSection).toContain("parentClosedAt: undefined");
	});

	// structural — asserts that the `case "new-list":` branch reuses emptySyncState() (which has parentClosedAt unset); branch lives in the closure.
	it("resets parentClosedAt when creating a new list", () => {
		const newListSection = tasksSource.slice(
			tasksSource.indexOf('case "new-list":'),
			tasksSource.indexOf('// Support initial tasks'),
		);
		expect(newListSection).toContain("emptySyncState()");
	});

	// structural — asserts that the guard expression flows into the cmd dispatch within the closure-scoped helper.
	it("does not double-fire by checking parentClosedAt before queueing update", () => {
		const checkMissionCompleteSection = tasksSource.slice(
			tasksSource.indexOf("if (syncState.groupId === undefined || syncState.parentClosedAt) return;"),
			tasksSource.indexOf("// ── State reconstruction from session"),
		);
		expect(checkMissionCompleteSection).toContain("syncToCommander(");
		expect(checkMissionCompleteSection).toContain("commander_task");
	});

	// structural — asserts that parentClosedAt is written after dispatch inside the closure-scoped helper.
	it("marks parentClosedAt after firing the update", () => {
		const checkMissionCompleteSection = tasksSource.slice(
			tasksSource.indexOf("function closeCommanderParentIfAllLocalTasksDone()"),
			tasksSource.indexOf("// ── State reconstruction from session"),
		);
		expect(checkMissionCompleteSection).toContain("syncState = {");
		expect(checkMissionCompleteSection).toContain("parentClosedAt: Date.now()");
	});
});

describe("SyncState type definition", () => {
	it("includes parentClosedAt optional field", () => {
		// Behavioral: emptySyncState() must be type-compatible with a SyncState
		// that carries parentClosedAt. Build one with the field set and one
		// without — both should round-trip through the structural-clone shape
		// used by tasks.ts (spread + reassign).
		const base: SyncState = emptySyncState();
		expect(base.parentClosedAt).toBeUndefined();

		const closed: SyncState = { ...base, parentClosedAt: 1_700_000_000_000 };
		expect(closed.parentClosedAt).toBe(1_700_000_000_000);

		// And resetting clears it cleanly via the same shape used in the
		// `case "clear":` branch.
		const reset: SyncState = { ...closed, parentClosedAt: undefined };
		expect(reset.parentClosedAt).toBeUndefined();
	});
});
