// ABOUTME: Fix 1 — when group:create resolves AFTER the user has already toggled the
// ABOUTME: local task, the new mapping's lastSyncedStatus is the stale desiredStatus from
// ABOUTME: addPendingCreates time. executeGroupCreate must catch up the drift by firing
// ABOUTME: status-update calls for any newly mapped task whose current status differs.

import { describe, it, expect, vi } from "vitest";
import {
	executeGroupCreate,
	emptySyncState,
	addPendingCreates,
	markGroupCreationInFlight,
} from "../lib/commander/commander-sync";

function setupState(localIds: number[]) {
	const pending = localIds.map((id) => ({ id, text: `task ${id}`, status: "idle" as const }));
	let s = emptySyncState();
	s = addPendingCreates(s, pending as any, "group");
	s = markGroupCreationInFlight(s);
	return s;
}

describe("Fix 1: catch up status drift on group:create resolve", () => {
	it("fires status-update for a task whose local status drifted to 'done' during the in-flight window", async () => {
		const state = setupState([1]);
		const successPayload = {
			content: [{ type: "text", text: JSON.stringify({ group_id: 1308, task_ids: [1309] }) }],
		};
		const client = { callTool: vi.fn(async () => successPayload) };
		const onResolved = vi.fn();

		await executeGroupCreate({
			client,
			payload: { operation: "group:create" },
			localIds: [1],
			getState: () => state,
			onResolved,
			// The caller's local task #1 has drifted from "idle" → "done" since addPendingCreates
			getCurrentStatuses: () => new Map([[1, "done"]]),
		});

		// First call: the group:create itself
		expect(client.callTool).toHaveBeenNthCalledWith(1, "commander_task", { operation: "group:create" }, 30_000);
		// Second call: the catch-up status-update for the drifted task
		expect(client.callTool).toHaveBeenCalledWith("commander_task", expect.objectContaining({
			operation: "update",
			task_id: 1309,
			status: "completed",
		}));
		expect(client.callTool).toHaveBeenCalledTimes(2);
	});

	it("fires status-update for a task drifted to 'inprogress'", async () => {
		const state = setupState([1]);
		const successPayload = {
			content: [{ type: "text", text: JSON.stringify({ group_id: 1310, task_ids: [1311] }) }],
		};
		const client = { callTool: vi.fn(async () => successPayload) };
		const onResolved = vi.fn();

		await executeGroupCreate({
			client,
			payload: {},
			localIds: [1],
			getState: () => state,
			onResolved,
			getCurrentStatuses: () => new Map([[1, "inprogress"]]),
		});

		expect(client.callTool).toHaveBeenCalledWith("commander_task", expect.objectContaining({
			operation: "update",
			task_id: 1311,
			status: "working",
		}));
	});

	it("does NOT fire catch-up update when status matches desired", async () => {
		const state = setupState([1, 2]);
		const successPayload = {
			content: [{ type: "text", text: JSON.stringify({ group_id: 1, task_ids: [10, 11] }) }],
		};
		const client = { callTool: vi.fn(async () => successPayload) };

		await executeGroupCreate({
			client,
			payload: {},
			localIds: [1, 2],
			getState: () => state,
			onResolved: vi.fn(),
			getCurrentStatuses: () => new Map([[1, "idle"], [2, "idle"]]),
		});

		// Only the group:create call, no catch-up updates
		expect(client.callTool).toHaveBeenCalledTimes(1);
	});

	it("fires catch-up only for drifted tasks in a mixed batch", async () => {
		const state = setupState([1, 2, 3]);
		const successPayload = {
			content: [{ type: "text", text: JSON.stringify({ group_id: 5, task_ids: [50, 51, 52] }) }],
		};
		const client = { callTool: vi.fn(async () => successPayload) };

		await executeGroupCreate({
			client,
			payload: {},
			localIds: [1, 2, 3],
			getState: () => state,
			onResolved: vi.fn(),
			// #1 idle (no drift), #2 done (drift), #3 inprogress (drift)
			getCurrentStatuses: () => new Map([[1, "idle"], [2, "done"], [3, "inprogress"]]),
		});

		// 1 group:create + 2 catch-up updates (for #2 and #3 only)
		expect(client.callTool).toHaveBeenCalledTimes(3);
		expect(client.callTool).toHaveBeenCalledWith("commander_task", expect.objectContaining({
			task_id: 51, status: "completed",
		}));
		expect(client.callTool).toHaveBeenCalledWith("commander_task", expect.objectContaining({
			task_id: 52, status: "working",
		}));
	});

	it("fires catch-up when user toggled pending entries to 'done' during in-flight (the real bug)", async () => {
		// Reproduces the live failure pattern: user calls new-list (pending desiredStatus
		// starts as "idle"), then toggles the local task during the ~8s in-flight window
		// (which calls addPendingCreate updating the pending entry's desiredStatus to "done").
		// Pre-fix: applyGroupCreateResult would write lastSyncedStatus="done" (the latest
		// desired), making the drift detector see no drift. Post-fix: lastSyncedStatus="idle"
		// (the actual create status), so drift IS detected and catch-up fires.
		let state = emptySyncState();
		// new-list: add pending with initial status idle
		state = addPendingCreates(state, [{ id: 1, text: "task", status: "idle" as const }], "group");
		state = markGroupCreationInFlight(state);
		// Simulate user toggle DURING in-flight by calling addPendingCreate again with
		// the post-toggle status. This is what extensions/tasks.ts:953 does.
		const { addPendingCreate: addOne } = await import("../lib/commander/commander-sync");
		state = addOne(state, { id: 1, text: "task", status: "done" as const }, "group");

		const successPayload = {
			content: [{ type: "text", text: JSON.stringify({ group_id: 100, task_ids: [101] }) }],
		};
		const client = { callTool: vi.fn(async () => successPayload) };

		await executeGroupCreate({
			client,
			payload: {},
			localIds: [1],
			getState: () => state,
			onResolved: vi.fn(),
			getCurrentStatuses: () => new Map([[1, "done"]]),
		});

		// MUST fire the catch-up update — even though pending.desiredStatus was bumped
		// to "done" during in-flight, lastSyncedStatus should remain "idle" (actual sync
		// state), so drift "done" != "idle" → catch-up fires.
		expect(client.callTool).toHaveBeenCalledWith("commander_task", expect.objectContaining({
			operation: "update",
			task_id: 101,
			status: "completed",
		}));
	});

	it("is a no-op when getCurrentStatuses is not provided (backward-compatible)", async () => {
		const state = setupState([1]);
		const successPayload = {
			content: [{ type: "text", text: JSON.stringify({ group_id: 1, task_ids: [10] }) }],
		};
		const client = { callTool: vi.fn(async () => successPayload) };

		await executeGroupCreate({
			client,
			payload: {},
			localIds: [1],
			getState: () => state,
			onResolved: vi.fn(),
		});

		// Only the group:create call
		expect(client.callTool).toHaveBeenCalledTimes(1);
	});
});
