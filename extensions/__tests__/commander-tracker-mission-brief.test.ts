// ABOUTME: Tests that commander-tracker carries the list's work summary into the
// ABOUTME: batched group:create payload (so the dashboard InitiativeCard has real
// ABOUTME: content) instead of stamping mission_brief on every per-task create —
// ABOUTME: which would auto-label every child as initiative-root and hide them.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { _setCommanderClientForTests, _resetCommanderClientForTests } from "../lib/commander/commander-cli-client.ts";

function makeMockClient() {
	const calls: Array<{ tool: string; params: any }> = [];
	const client = {
		callTool: vi.fn(async (tool: string, params: any) => {
			calls.push({ tool, params });
			if (params?.operation === "group:create") {
				const taskIds = (params.tasks as any[]).map((_: any, i: number) => 300 + i);
				return { content: [{ type: "text", text: JSON.stringify({ group_id: 200, task_ids: taskIds }) }] };
			}
			return { content: [{ type: "text", text: JSON.stringify({ id: 42, task_id: 42 }) }] };
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

describe("commander-tracker — initiative summary carried via batched group:create when groupId is undefined", () => {
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

	it("carries listDescription as initiative_summary in the batched group:create when groupId is undefined", async () => {
		const { client, calls } = makeMockClient();
		const g = globalThis as any;
		_setCommanderClientForTests(client, true);
		g.__piTaskList = {
			title: "OAuth Migration",
			description: "Migrate JWT to OAuth so we get SSO and refresh tokens.",
			tasks: [{ id: 1, text: "Audit JWT callsites", status: "idle" }],
			__syncState: { mappings: [], groupId: undefined, groupCreationInFlight: false, available: true },
		};

		const mod = await import("../commander-tracker.ts");
		const pi = makeMockPi();
		mod.default(pi as any);
		await pi._handlers["session_start"]({}, {});
		await new Promise((r) => setTimeout(r, 0));

		const groupCreates = calls.filter((c) => c.params?.operation === "group:create");
		expect(groupCreates.length).toBe(1);
		expect(groupCreates[0].params.initiative_summary).toBe(
			"Migrate JWT to OAuth so we get SSO and refresh tokens.",
		);
		const perTaskCreates = calls.filter((c) => c.params?.operation === "create");
		for (const c of perTaskCreates) {
			expect(c.params.mission_brief).toBeUndefined();
		}
	});

	it("falls back to the list title when description is empty", async () => {
		const { client, calls } = makeMockClient();
		const g = globalThis as any;
		_setCommanderClientForTests(client, true);
		g.__piTaskList = {
			title: "Auth Cleanup",
			description: "",
			tasks: [{ id: 1, text: "Drop expired sessions", status: "idle" }],
			__syncState: { mappings: [], groupId: undefined, groupCreationInFlight: false, available: true },
		};

		const mod = await import("../commander-tracker.ts");
		const pi = makeMockPi();
		mod.default(pi as any);
		await pi._handlers["session_start"]({}, {});
		await new Promise((r) => setTimeout(r, 0));

		const groupCreates = calls.filter((c) => c.params?.operation === "group:create");
		expect(groupCreates.length).toBe(1);
		expect(groupCreates[0].params.initiative_summary).toBe("Auth Cleanup");
	});

	it("does NOT attach mission_brief when groupId is set (children inherit)", async () => {
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

		const created = calls.filter((c) => c.params?.operation === "create");
		expect(created.length).toBeGreaterThan(0);
		expect(created[0].params.mission_brief).toBeUndefined();
		expect(created[0].params.group_id).toBe(7);
	});
});
