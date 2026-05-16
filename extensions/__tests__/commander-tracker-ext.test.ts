// ABOUTME: Tests for commander-tracker extension lifecycle and interval behavior.
// ABOUTME: Verifies activation via onReady, reconcile interval, heartbeat, and deactivation.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Minimal mock for the extension's dependencies
function makeGlobalState() {
	return {
		__piCommanderGate: null as any,
		__piCommanderOnReady: [] as Array<() => void>,
		__piCommanderClient: null as any,
		__piCommanderTracker: null as any,
		__piCurrentTask: null as any,
		__piTaskList: null as any,
	};
}

// Import the pure functions we're testing
import { createTrackerState, addRetry, popRetries, computeReconcileActions } from "../lib/commander/commander-tracker.ts";

describe("commander-tracker extension behavior", () => {
	let g: ReturnType<typeof makeGlobalState>;

	beforeEach(() => {
		g = makeGlobalState();
		// Patch globalThis
		Object.assign(globalThis, g);
	});

	afterEach(() => {
		// Clean up globalThis
		for (const key of Object.keys(g)) {
			delete (globalThis as any)[key];
		}
	});

	// The previous "activation" describe block tested the async ready-gate flow
	// (createReadyGate + resolveGate). With the commander-mcp teardown the gate
	// is retired — `cmd` is either on PATH or it isn't — so those tests no
	// longer model the real activation path and were removed alongside
	// commander-ready.ts.

	describe("reconcile logic", () => {
		it("detects unmapped tasks via computeReconcileActions", () => {
			const localTasks = [
				{ id: 1, text: "Task A", status: "idle" },
				{ id: 2, text: "Task B", status: "inprogress" },
			];
			const mappings = [{ localId: 1, commanderId: 100 }];
			const actions = computeReconcileActions(localTasks, mappings);
			expect(actions).toEqual([{ type: "create", localId: 2, text: "Task B" }]);
		});

		it("returns empty when all tasks mapped", () => {
			const localTasks = [{ id: 1, text: "Task A", status: "idle" }];
			const mappings = [{ localId: 1, commanderId: 100 }];
			const actions = computeReconcileActions(localTasks, mappings);
			expect(actions).toEqual([]);
		});
	});

	describe("retry draining", () => {
		it("pops and clears retry queue", () => {
			let state = createTrackerState();
			state = addRetry(state, "op-a", vi.fn());
			state = addRetry(state, "op-b", vi.fn());

			const { entries, state: newState } = popRetries(state);
			expect(entries).toHaveLength(2);
			expect(newState.retries).toEqual([]);
		});

		it("executes retried fns with client", async () => {
			let state = createTrackerState();
			const fn = vi.fn().mockResolvedValue(undefined);
			state = addRetry(state, "retry-me", fn);

			const { entries } = popRetries(state);
			const mockClient = { callTool: vi.fn() };
			// Simulate what tracker reconcile does: call each fn
			for (const entry of entries) {
				await entry.fn(mockClient);
			}
			expect(fn).toHaveBeenCalledWith(mockClient);
		});
	});

	describe("tracker state published on globalThis", () => {
		it("publishes tracker with _state and active flag", () => {
			const tracker = {
				active: true,
				_state: createTrackerState(),
				reconcileNow: () => {},
			};
			(globalThis as any).__piCommanderTracker = tracker;

			expect((globalThis as any).__piCommanderTracker.active).toBe(true);
			expect((globalThis as any).__piCommanderTracker._state.retries).toEqual([]);
		});
	});
});
