// ABOUTME: Tests for parent task completion on mission-complete.
// ABOUTME: Verifies that when all children are done, the initiative-root parent is updated to completed.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const tasksSource = readFileSync(join(__dirname, "..", "tasks.ts"), "utf-8");

describe("parent task completion on mission-complete", () => {
	it("calls syncToCommander with mission-complete label when all tasks are done", () => {
		const checkMissionCompleteSection = tasksSource.slice(
			tasksSource.indexOf("function checkMissionComplete(ctx: ExtensionContext)"),
			tasksSource.indexOf("// ── State reconstruction from session"),
		);
		expect(checkMissionCompleteSection).toContain('syncToCommander("mission-complete"');
	});

	it("sends commander_task update with operation update and status completed", () => {
		const checkMissionCompleteSection = tasksSource.slice(
			tasksSource.indexOf("function checkMissionComplete(ctx: ExtensionContext)"),
			tasksSource.indexOf("// ── State reconstruction from session"),
		);
		expect(checkMissionCompleteSection).toContain('operation: "update"');
		expect(checkMissionCompleteSection).toContain('status: "completed"');
		expect(checkMissionCompleteSection).toContain('task_id: syncState.groupId');
	});

	it("guards against double-firing with parentClosedAt flag", () => {
		const checkMissionCompleteSection = tasksSource.slice(
			tasksSource.indexOf("function checkMissionComplete(ctx: ExtensionContext)"),
			tasksSource.indexOf("// ── State reconstruction from session"),
		);
		expect(checkMissionCompleteSection).toContain("!syncState.parentClosedAt");
		expect(checkMissionCompleteSection).toContain("parentClosedAt: Date.now()");
	});

	it("only fires parent-complete if groupId is defined", () => {
		const checkMissionCompleteSection = tasksSource.slice(
			tasksSource.indexOf("function checkMissionComplete(ctx: ExtensionContext)"),
			tasksSource.indexOf("// ── State reconstruction from session"),
		);
		expect(checkMissionCompleteSection).toContain("syncState.groupId !== undefined");
	});

	it("resets parentClosedAt when clearing the task list", () => {
		const clearStartIdx = tasksSource.indexOf('case "clear":', tasksSource.indexOf('execute(_toolCallId'));
		const clearSection = tasksSource.slice(
			clearStartIdx,
			clearStartIdx + 1500,
		);
		expect(clearSection).toContain("parentClosedAt: undefined");
	});

	it("resets parentClosedAt when creating a new list", () => {
		const newListSection = tasksSource.slice(
			tasksSource.indexOf('case "new-list":'),
			tasksSource.indexOf('// Support initial tasks'),
		);
		expect(newListSection).toContain("emptySyncState()");
	});

	it("does not double-fire by checking parentClosedAt before queueing update", () => {
		const checkMissionCompleteSection = tasksSource.slice(
			tasksSource.indexOf("if (syncState.groupId !== undefined && !syncState.parentClosedAt)"),
			tasksSource.indexOf("// Mark that we've fired the parent-close update"),
		);
		expect(checkMissionCompleteSection).toContain("syncToCommander(");
		expect(checkMissionCompleteSection).toContain("commander_task");
	});

	it("marks parentClosedAt after firing the update", () => {
		const checkMissionCompleteSection = tasksSource.slice(
			tasksSource.indexOf('// Mark that we\'ve fired the parent-close update'),
			tasksSource.indexOf("// ── State reconstruction from session"),
		);
		expect(checkMissionCompleteSection).toContain("syncState = {");
		expect(checkMissionCompleteSection).toContain("parentClosedAt: Date.now()");
	});
});

describe("SyncState type definition", () => {
	it("includes parentClosedAt optional field", () => {
		const syncStateImportFile = readFileSync(
			join(__dirname, "..", "lib", "commander", "commander-sync.ts"),
			"utf-8",
		);
		const syncStateInterface = syncStateImportFile.slice(
			syncStateImportFile.indexOf("export interface SyncState"),
			syncStateImportFile.indexOf("// ── State mapping"),
		);
		expect(syncStateInterface).toContain("parentClosedAt?: number");
	});
});
