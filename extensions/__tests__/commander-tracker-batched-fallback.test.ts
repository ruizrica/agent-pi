// ABOUTME: Tests that commander-tracker, when groupId is undefined and unmapped
// ABOUTME: tasks exist, retries the original group:create as a single batched call
// ABOUTME: instead of producing per-task orphan creates (each of which becomes a
// ABOUTME: hidden initiative-root row on the Kanban board).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { _setCommanderClientForTests, _resetCommanderClientForTests } from "../lib/commander/commander-cli-client.ts";

function makeMockClient(groupResponse?: { id: number; taskIds: number[] }) {
	const calls: Array<{ tool: string; params: any }> = [];
	const client = {
		callTool: vi.fn(async (tool: string, params: any) => {
			calls.push({ tool, params });
			if (params?.operation === "group:create") {
				const id = groupResponse?.id ?? 200;
				const taskIds = groupResponse?.taskIds ?? (params.tasks as any[]).map((_: any, i: number) => 300 + i);
				return { content: [{ type: "text", text: JSON.stringify({ group_id: id, task_ids: taskIds }) }] };
			}
			// Per-task create — return a synthetic id so we can assert it should NOT happen.
			return { content: [{ type: "text", text: JSON.stringify({ id: 999, task_id: 999 }) }] };
		}),
	};
	return { client, calls };
}

function makeMockPi() {
	const handlers: Record<string, (...args: any[]) => any> = {};
	return {
		on: (event: string, fn: (...a: any[]) => any) => { handlers[event] = fn; },
		registerTool: vi.fn(),
		_handlers: handlers,
	};
}

describe("commander-tracker — batched group:create fallback when groupId is undefined", () => {
	beforeEach(() => {
		const g = globalThis as any;
		delete g.__piCommanderGate;
		delete g.__piCommanderClient;
		delete g.__piCommanderTracker;
		delete g.__piTaskList;
		delete g.__piCurrentTask;
		delete g.__piCommanderOnReady;
		_resetCommanderClientForTests();
	});

	afterEach(() => {
		const g = globalThis as any;
		if (g.__piCommanderTracker?.active) g.__piCommanderTracker = null;
		_resetCommanderClientForTests();
	});

	it("dispatches a single group:create with all unmapped tasks batched in, not per-task creates", async () => {
		const { client, calls } = makeMockClient();
		const g = globalThis as any;
		_setCommanderClientForTests(client, true);
		const syncState = {
			available: true,
			groupId: undefined,
			groupCreationInFlight: false,
			mappings: [] as any[],
			pendingCreates: [
				{ localId: 1, text: "Audit JWT callsites", desiredStatus: "idle", requestedAt: Date.now(), mode: "group" },
				{ localId: 2, text: "Replace token store", desiredStatus: "idle", requestedAt: Date.now(), mode: "group" },
				{ localId: 3, text: "Roll out behind flag", desiredStatus: "idle", requestedAt: Date.now(), mode: "group" },
			],
		};
		g.__piTaskList = {
			title: "OAuth Migration",
			description: "Migrate JWT to OAuth so we get SSO and refresh tokens.",
			tasks: [
				{ id: 1, text: "Audit JWT callsites", status: "idle" },
				{ id: 2, text: "Replace token store", status: "idle" },
				{ id: 3, text: "Roll out behind flag", status: "idle" },
			],
			__syncState: syncState,
		};

		const mod = await import("../commander-tracker.ts");
		const pi = makeMockPi();
		mod.default(pi as any);
		await pi._handlers["session_start"]({}, {});
		await new Promise((r) => setTimeout(r, 0));

		const groupCreates = calls.filter((c) => c.params?.operation === "group:create");
		const perTaskCreates = calls.filter((c) => c.params?.operation === "create");

		expect(groupCreates.length).toBe(1);
		expect(perTaskCreates.length).toBe(0);

		const batched = groupCreates[0].params;
		expect(batched.group_name).toBe("OAuth Migration");
		expect(batched.initiative_summary).toBe("Migrate JWT to OAuth so we get SSO and refresh tokens.");
		expect(Array.isArray(batched.tasks)).toBe(true);
		expect(batched.tasks).toHaveLength(3);
		expect(batched.tasks.map((t: any) => t.description)).toEqual([
			"Audit JWT callsites",
			"Replace token store",
			"Roll out behind flag",
		]);
	});

	it("applies the batched group result back to syncState (groupId + per-task mappings)", async () => {
		const { client } = makeMockClient({ id: 700, taskIds: [701, 702] });
		const g = globalThis as any;
		_setCommanderClientForTests(client, true);
		const syncState = {
			available: true,
			groupId: undefined,
			groupCreationInFlight: false,
			mappings: [] as any[],
			pendingCreates: [
				{ localId: 1, text: "First", desiredStatus: "idle", requestedAt: Date.now(), mode: "group" },
				{ localId: 2, text: "Second", desiredStatus: "idle", requestedAt: Date.now(), mode: "group" },
			],
		};
		g.__piTaskList = {
			title: "Mission",
			description: "Mission description.",
			tasks: [
				{ id: 1, text: "First", status: "idle" },
				{ id: 2, text: "Second", status: "idle" },
			],
			__syncState: syncState,
		};

		const mod = await import("../commander-tracker.ts");
		const pi = makeMockPi();
		mod.default(pi as any);
		await pi._handlers["session_start"]({}, {});
		await new Promise((r) => setTimeout(r, 0));
		await new Promise((r) => setTimeout(r, 0));

		expect(syncState.groupId).toBe(700);
		expect(syncState.mappings).toEqual([
			expect.objectContaining({ localId: 1, commanderId: 701, lastSyncedStatus: "idle" }),
			expect.objectContaining({ localId: 2, commanderId: 702, lastSyncedStatus: "idle" }),
		]);
		expect((syncState.pendingCreates || []).length).toBe(0);
	});

	it("when groupId is already set, falls through to per-task create with group_id and NO mission_brief", async () => {
		const { client, calls } = makeMockClient();
		const g = globalThis as any;
		_setCommanderClientForTests(client, true);
		g.__piTaskList = {
			title: "OAuth Migration",
			description: "Real mission brief that should NOT land on children.",
			tasks: [{ id: 2, text: "Child task", status: "idle" }],
			__syncState: { mappings: [], groupId: 7, groupCreationInFlight: false, available: true },
		};

		const mod = await import("../commander-tracker.ts");
		const pi = makeMockPi();
		mod.default(pi as any);
		await pi._handlers["session_start"]({}, {});
		await new Promise((r) => setTimeout(r, 0));

		const perTaskCreates = calls.filter((c) => c.params?.operation === "create");
		expect(perTaskCreates.length).toBe(1);
		expect(perTaskCreates[0].params.mission_brief).toBeUndefined();
		expect(perTaskCreates[0].params.group_id).toBe(7);

		const groupCreates = calls.filter((c) => c.params?.operation === "group:create");
		expect(groupCreates.length).toBe(0);
	});
});
