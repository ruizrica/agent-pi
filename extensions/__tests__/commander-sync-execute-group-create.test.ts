// ABOUTME: Phase 1 of Commander lifecycle consolidation (Option 2) — locks in the contract
// ABOUTME: for executeGroupCreate, the extracted helper that replaces two duplicated lambdas in tasks.ts.

import { describe, it, expect, vi } from "vitest";
import {
	executeGroupCreate,
	emptySyncState,
	addPendingCreates,
	markGroupCreationInFlight,
	type SyncState,
} from "../lib/commander/commander-sync";

function makeState(localIds: number[]): SyncState {
	const pending = localIds.map((id) => ({ id, text: `task ${id}`, status: "idle" as const }));
	let s = emptySyncState();
	s = addPendingCreates(s, pending as any, "group");
	s = markGroupCreationInFlight(s);
	return s;
}

describe("executeGroupCreate (Phase 1 of lifecycle consolidation)", () => {
	it("on parse-success: invokes onResolved with applyGroupCreateResult output and calls onSuccess", async () => {
		const state = makeState([1, 2]);
		const localIds = [1, 2];
		const successPayload = {
			content: [{
				type: "text",
				text: JSON.stringify({
					group_id: 100,
					task_ids: [101, 102],
				}),
			}],
		};
		const client = { callTool: vi.fn(async () => successPayload) };
		const onResolved = vi.fn();
		const onSuccess = vi.fn();

		await executeGroupCreate({
			client,
			payload: { operation: "group:create" },
			localIds,
			getState: () => state,
			onResolved,
			onSuccess,
		});

		expect(client.callTool).toHaveBeenCalledWith("commander_task", { operation: "group:create" }, 30_000);
		expect(onResolved).toHaveBeenCalledTimes(1);
		expect(onSuccess).toHaveBeenCalledTimes(1);
		const next: SyncState = onResolved.mock.calls[0][0];
		expect(next.groupId).toBe(100);
		expect(next.groupCreationInFlight).toBe(false);
		expect(next.mappings.length).toBe(2);
	});

	it("on parse-failure (unrecognized JSON shape): invokes onResolved with settled state and does NOT call onSuccess", async () => {
		const state = makeState([1, 2]);
		const unrecognized = { content: [{ type: "text", text: JSON.stringify({ unrelated: true }) }] };
		const client = { callTool: vi.fn(async () => unrecognized) };
		const onResolved = vi.fn();
		const onSuccess = vi.fn();

		await executeGroupCreate({
			client,
			payload: { operation: "group:create" },
			localIds: [1, 2],
			getState: () => state,
			onResolved,
			onSuccess,
		});

		expect(onResolved).toHaveBeenCalledTimes(1);
		expect(onSuccess).not.toHaveBeenCalled();
		const next: SyncState = onResolved.mock.calls[0][0];
		expect(next.groupCreationInFlight).toBe(false);
		expect(next.groupId).toBeUndefined();
	});

	it("on rejected callTool: invokes onResolved with settled state, re-throws, and does NOT call onSuccess", async () => {
		const state = makeState([1, 2]);
		const boom = new Error("execFile killed (SIGTERM, timeout=30000ms)");
		const client = { callTool: vi.fn(async () => { throw boom; }) };
		const onResolved = vi.fn();
		const onSuccess = vi.fn();

		await expect(
			executeGroupCreate({
				client,
				payload: { operation: "group:create" },
				localIds: [1, 2],
				getState: () => state,
				onResolved,
				onSuccess,
			}),
		).rejects.toThrow("execFile killed");

		expect(onResolved).toHaveBeenCalledTimes(1);
		expect(onSuccess).not.toHaveBeenCalled();
		const next: SyncState = onResolved.mock.calls[0][0];
		expect(next.groupCreationInFlight).toBe(false);
	});

	it("reads getState() fresh at resolution time, not at setup time", async () => {
		// This guards against the subtle behavior change we'd introduce by passing
		// a state value: the original lambdas read syncState AFTER the await, so any
		// concurrent reassignment is observed. Helper must preserve that.
		let liveState = makeState([1, 2]);
		const successPayload = {
			content: [{
				type: "text",
				text: JSON.stringify({ group_id: 200, task_ids: [201, 202] }),
			}],
		};
		const client = {
			callTool: vi.fn(async () => {
				// Simulate concurrent state reassignment during in-flight subprocess.
				liveState = makeState([1, 2, 3]); // a different state shape
				return successPayload;
			}),
		};
		const onResolved = vi.fn();

		await executeGroupCreate({
			client,
			payload: { operation: "group:create" },
			localIds: [1, 2],
			getState: () => liveState,
			onResolved,
		});

		// applyGroupCreateResult must have been applied to the post-await liveState,
		// not the pre-await snapshot. Verify by checking pendingCreates was updated
		// for the live state (which had 3 pending entries, not 2).
		const next: SyncState = onResolved.mock.calls[0][0];
		expect(next.groupId).toBe(200);
		// The post-await state had 3 pendingCreates; applyGroupCreateResult drains 2;
		// so 1 remains. The pre-await state had 2; if helper had read pre-await it
		// would have drained both and left 0. We expect 1 to confirm fresh read.
		expect(next.pendingCreates?.length ?? 0).toBe(1);
	});
});
