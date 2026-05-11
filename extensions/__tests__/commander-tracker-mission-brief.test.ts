// ABOUTME: Tests that commander-tracker forwards a mission_brief when it creates
// ABOUTME: a fallback root task (groupId undefined), pulling the brief from the
// ABOUTME: published __piTaskList.description so the dashboard has real content.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

function makeMockClient() {
	const calls: Array<{ tool: string; params: any }> = [];
	const client = {
		callTool: vi.fn(async (tool: string, params: any) => {
			calls.push({ tool, params });
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

describe("commander-tracker — mission brief forwarding on fallback root create", () => {
	beforeEach(() => {
		const g = globalThis as any;
		delete g.__piCommanderGate;
		delete g.__piCommanderClient;
		delete g.__piCommanderTracker;
		delete g.__piTaskList;
		delete g.__piCurrentTask;
		delete g.__piCommanderOnReady;
	});

	afterEach(() => {
		const g = globalThis as any;
		if (g.__piCommanderTracker?.active) g.__piCommanderTracker = null;
	});

	it("attaches mission_brief from listDescription when groupId is undefined", async () => {
		const { client, calls } = makeMockClient();
		const g = globalThis as any;
		g.__piCommanderClient = client;
		// available gate so activate() runs synchronously on session_start
		g.__piCommanderGate = { state: "available" };
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

		// Let the reconcile microtask resolve
		await new Promise((r) => setTimeout(r, 0));

		const created = calls.filter((c) => c.params?.operation === "create");
		expect(created.length).toBeGreaterThan(0);
		const payload = created[0].params;
		expect(payload.mission_brief).toBe(
			"Migrate JWT to OAuth so we get SSO and refresh tokens.",
		);
		expect(payload.group_id).toBeUndefined();
	});

	it("falls back to the list title when description is empty", async () => {
		const { client, calls } = makeMockClient();
		const g = globalThis as any;
		g.__piCommanderClient = client;
		g.__piCommanderGate = { state: "available" };
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

		const created = calls.filter((c) => c.params?.operation === "create");
		expect(created.length).toBeGreaterThan(0);
		expect(created[0].params.mission_brief).toBe("Auth Cleanup");
	});

	it("does NOT attach mission_brief when groupId is set (children inherit)", async () => {
		const { client, calls } = makeMockClient();
		const g = globalThis as any;
		g.__piCommanderClient = client;
		g.__piCommanderGate = { state: "available" };
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
