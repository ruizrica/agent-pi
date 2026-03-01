// ABOUTME: Tests for pure commander-tracker logic (retry queue, reconcile actions).
// ABOUTME: No side effects — validates state machine for retry capping and unmapped task detection.

import { describe, it, expect, vi } from "vitest";
import {
	createTrackerState,
	addRetry,
	popRetries,
	computeReconcileActions,
	isFullySynced,
	type TrackerState,
	type ReconcileAction,
} from "../lib/commander-tracker.ts";

describe("createTrackerState", () => {
	it("starts with empty retry queue", () => {
		const state = createTrackerState();
		expect(state.retries).toEqual([]);
	});
});

describe("addRetry", () => {
	it("adds a retry entry", () => {
		let state = createTrackerState();
		const fn = vi.fn();
		state = addRetry(state, "sync-task-1", fn);
		expect(state.retries).toHaveLength(1);
		expect(state.retries[0].label).toBe("sync-task-1");
		expect(state.retries[0].attempts).toBe(1);
	});

	it("increments attempts for duplicate labels", () => {
		let state = createTrackerState();
		const fn1 = vi.fn();
		const fn2 = vi.fn();
		state = addRetry(state, "sync-task-1", fn1);
		state = addRetry(state, "sync-task-1", fn2);
		expect(state.retries).toHaveLength(1);
		expect(state.retries[0].attempts).toBe(2);
		// Latest fn replaces old one
		expect(state.retries[0].fn).toBe(fn2);
	});

	it("caps at maxRetries (default 3) and drops the entry", () => {
		let state = createTrackerState();
		state = addRetry(state, "doomed", vi.fn());
		state = addRetry(state, "doomed", vi.fn());
		state = addRetry(state, "doomed", vi.fn());
		// Third attempt hits cap — entry should be removed
		expect(state.retries).toHaveLength(0);
	});

	it("respects custom maxRetries", () => {
		let state = createTrackerState();
		state = addRetry(state, "custom", vi.fn(), 5);
		state = addRetry(state, "custom", vi.fn(), 5);
		state = addRetry(state, "custom", vi.fn(), 5);
		state = addRetry(state, "custom", vi.fn(), 5);
		// 4 attempts, not at cap yet
		expect(state.retries).toHaveLength(1);
		expect(state.retries[0].attempts).toBe(4);
		// 5th hits cap
		state = addRetry(state, "custom", vi.fn(), 5);
		expect(state.retries).toHaveLength(0);
	});

	it("tracks multiple distinct labels independently", () => {
		let state = createTrackerState();
		state = addRetry(state, "task-a", vi.fn());
		state = addRetry(state, "task-b", vi.fn());
		state = addRetry(state, "task-a", vi.fn());
		expect(state.retries).toHaveLength(2);
		expect(state.retries.find(r => r.label === "task-a")?.attempts).toBe(2);
		expect(state.retries.find(r => r.label === "task-b")?.attempts).toBe(1);
	});
});

describe("popRetries", () => {
	it("returns all entries and clears the queue", () => {
		let state = createTrackerState();
		state = addRetry(state, "a", vi.fn());
		state = addRetry(state, "b", vi.fn());

		const { entries, state: newState } = popRetries(state);
		expect(entries).toHaveLength(2);
		expect(newState.retries).toEqual([]);
	});

	it("returns empty array when no retries queued", () => {
		const state = createTrackerState();
		const { entries, state: newState } = popRetries(state);
		expect(entries).toEqual([]);
		expect(newState.retries).toEqual([]);
	});
});

describe("computeReconcileActions", () => {
	it("returns create actions for unmapped tasks", () => {
		const localTasks = [
			{ id: 1, text: "Task one", status: "idle" as const },
			{ id: 2, text: "Task two", status: "inprogress" as const },
			{ id: 3, text: "Task three", status: "done" as const },
		];
		const mappings = [{ localId: 1, commanderId: 100 }];

		const actions = computeReconcileActions(localTasks, mappings);
		// Task 2 is unmapped and not done — needs creation
		// Task 3 is done — skip
		expect(actions).toEqual([
			{ type: "create", localId: 2, text: "Task two" },
		]);
	});

	it("returns empty array when all tasks are mapped and in sync", () => {
		const localTasks = [
			{ id: 1, text: "Task one", status: "idle" as const },
		];
		const mappings = [{ localId: 1, commanderId: 100, lastSyncedStatus: "idle" }];

		const actions = computeReconcileActions(localTasks, mappings);
		expect(actions).toEqual([]);
	});

	it("returns empty array when task list is empty", () => {
		const actions = computeReconcileActions([], []);
		expect(actions).toEqual([]);
	});

	it("skips done tasks even if unmapped", () => {
		const localTasks = [
			{ id: 1, text: "Done task", status: "done" as const },
		];
		const actions = computeReconcileActions(localTasks, []);
		expect(actions).toEqual([]);
	});

	it("returns all unmapped non-done tasks as create actions", () => {
		const localTasks = [
			{ id: 1, text: "A", status: "idle" as const },
			{ id: 2, text: "B", status: "inprogress" as const },
			{ id: 3, text: "C", status: "idle" as const },
		];
		const actions = computeReconcileActions(localTasks, []);
		expect(actions).toHaveLength(3);
		expect(actions.every(a => a.type === "create")).toBe(true);
	});

	it("detects status drift on mapped tasks", () => {
		const localTasks = [
			{ id: 1, text: "Task one", status: "inprogress" as const },
		];
		const mappings = [{ localId: 1, commanderId: 100, lastSyncedStatus: "idle" as const }];

		const actions = computeReconcileActions(localTasks, mappings);
		expect(actions).toEqual([{
			type: "status-update",
			localId: 1,
			commanderId: 100,
			localStatus: "inprogress",
			commanderStatus: "working",
		}]);
	});

	it("no status-update when mapped task is in sync", () => {
		const localTasks = [
			{ id: 1, text: "Task one", status: "inprogress" as const },
		];
		const mappings = [{ localId: 1, commanderId: 100, lastSyncedStatus: "inprogress" as const }];

		const actions = computeReconcileActions(localTasks, mappings);
		expect(actions).toEqual([]);
	});

	it("undefined lastSyncedStatus means never synced — emits status-update", () => {
		const localTasks = [
			{ id: 1, text: "Task one", status: "inprogress" as const },
		];
		const mappings = [{ localId: 1, commanderId: 100 }];

		const actions = computeReconcileActions(localTasks, mappings);
		expect(actions).toEqual([{
			type: "status-update",
			localId: 1,
			commanderId: 100,
			localStatus: "inprogress",
			commanderStatus: "working",
		}]);
	});

	it("no status-update when undefined lastSyncedStatus but task is idle (default)", () => {
		const localTasks = [
			{ id: 1, text: "Task one", status: "idle" as const },
		];
		const mappings = [{ localId: 1, commanderId: 100 }];

		const actions = computeReconcileActions(localTasks, mappings);
		// idle maps to pending, which is the Commander default — no drift
		expect(actions).toEqual([]);
	});

	it("returns mixed create and status-update actions", () => {
		const localTasks = [
			{ id: 1, text: "Mapped stale", status: "done" as const },
			{ id: 2, text: "Unmapped", status: "idle" as const },
		];
		const mappings = [{ localId: 1, commanderId: 100, lastSyncedStatus: "inprogress" as const }];

		const actions = computeReconcileActions(localTasks, mappings);
		expect(actions).toHaveLength(2);
		expect(actions.find(a => a.type === "create")).toEqual({ type: "create", localId: 2, text: "Unmapped" });
		expect(actions.find(a => a.type === "status-update")).toEqual({
			type: "status-update",
			localId: 1,
			commanderId: 100,
			localStatus: "done",
			commanderStatus: "completed",
		});
	});
});

describe("isFullySynced", () => {
	it("returns true when all tasks are mapped and statuses match", () => {
		const localTasks = [
			{ id: 1, text: "Task one", status: "idle" },
			{ id: 2, text: "Task two", status: "inprogress" },
		];
		const mappings = [
			{ localId: 1, commanderId: 100, lastSyncedStatus: "idle" as const },
			{ localId: 2, commanderId: 101, lastSyncedStatus: "inprogress" as const },
		];
		expect(isFullySynced(localTasks, mappings)).toBe(true);
	});

	it("returns false when unmapped tasks exist", () => {
		const localTasks = [
			{ id: 1, text: "Mapped", status: "idle" },
			{ id: 2, text: "Unmapped", status: "idle" },
		];
		const mappings = [
			{ localId: 1, commanderId: 100, lastSyncedStatus: "idle" as const },
		];
		expect(isFullySynced(localTasks, mappings)).toBe(false);
	});

	it("returns false when mapped task has status drift", () => {
		const localTasks = [
			{ id: 1, text: "Drifted", status: "inprogress" },
		];
		const mappings = [
			{ localId: 1, commanderId: 100, lastSyncedStatus: "idle" as const },
		];
		expect(isFullySynced(localTasks, mappings)).toBe(false);
	});

	it("returns true for empty task list", () => {
		expect(isFullySynced([], [])).toBe(true);
	});
});
