// ABOUTME: Tests for Commander lifecycle enforcement in agent-team dispatcher.
// ABOUTME: Validates pre-dispatch claim and post-dispatch reconciliation logic.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Types mirroring agent-team internals ────────────────────────────

interface MockClient {
	callTool: ReturnType<typeof vi.fn>;
}

// ── commanderSync helper ────────────────────────────────────────────

/** Mirror of the commanderSync helper from agent-team.ts */
function commanderSync(fn: (client: any) => Promise<void>): void {
	const g = globalThis as any;
	if (!g.__piCommanderAvailable || !g.__piCommanderClient) return;
	fn(g.__piCommanderClient).catch(() => {});
}

describe("commanderSync", () => {
	beforeEach(() => {
		const g = globalThis as any;
		delete g.__piCommanderAvailable;
		delete g.__piCommanderClient;
	});

	it("calls fn with client when Commander globals are set", async () => {
		const client: MockClient = { callTool: vi.fn().mockResolvedValue({}) };
		const g = globalThis as any;
		g.__piCommanderAvailable = true;
		g.__piCommanderClient = client;

		const fn = vi.fn().mockResolvedValue(undefined);
		commanderSync(fn);

		expect(fn).toHaveBeenCalledWith(client);
	});

	it("no-ops when __piCommanderAvailable is false", () => {
		const client: MockClient = { callTool: vi.fn() };
		const g = globalThis as any;
		g.__piCommanderAvailable = false;
		g.__piCommanderClient = client;

		const fn = vi.fn();
		commanderSync(fn);

		expect(fn).not.toHaveBeenCalled();
	});

	it("no-ops when __piCommanderClient is missing", () => {
		const g = globalThis as any;
		g.__piCommanderAvailable = true;
		// no client

		const fn = vi.fn();
		commanderSync(fn);

		expect(fn).not.toHaveBeenCalled();
	});

	it("swallows errors from fn", async () => {
		const client: MockClient = { callTool: vi.fn() };
		const g = globalThis as any;
		g.__piCommanderAvailable = true;
		g.__piCommanderClient = client;

		const fn = vi.fn().mockRejectedValue(new Error("boom"));
		// Should not throw
		commanderSync(fn);

		// Give the microtask queue time to process the rejection
		await new Promise((r) => setTimeout(r, 10));
	});
});

// ── Pre-dispatch claim logic ────────────────────────────────────────

/** Mirror of pre-dispatch claim from agent-team.ts runAgent() */
function preDispatchClaim(
	commanderAvailable: boolean,
	taskId: number | undefined,
	agentName: string,
): void {
	if (commanderAvailable && taskId !== undefined) {
		commanderSync(async (client) => {
			await client.callTool("commander_task", {
				operation: "claim",
				task_id: taskId,
				agent_name: agentName,
			});
			await client.callTool("commander_mailbox", {
				operation: "send",
				from_agent: agentName,
				to_agent: "commander",
				body: `Starting task ${taskId}`,
				message_type: "status",
				task_id: taskId,
			});
		});
	}
}

describe("preDispatchClaim", () => {
	let client: MockClient;

	beforeEach(() => {
		const g = globalThis as any;
		client = { callTool: vi.fn().mockResolvedValue({}) };
		g.__piCommanderAvailable = true;
		g.__piCommanderClient = client;
	});

	it("calls claim and mailbox send with correct args", async () => {
		preDispatchClaim(true, 42, "planner");

		// Let the async fire-and-forget resolve
		await new Promise((r) => setTimeout(r, 10));

		expect(client.callTool).toHaveBeenCalledWith("commander_task", {
			operation: "claim",
			task_id: 42,
			agent_name: "planner",
		});
		expect(client.callTool).toHaveBeenCalledWith("commander_mailbox", {
			operation: "send",
			from_agent: "planner",
			to_agent: "commander",
			body: "Starting task 42",
			message_type: "status",
			task_id: 42,
		});
	});

	it("does not call Commander when taskId is undefined", async () => {
		preDispatchClaim(true, undefined, "planner");
		await new Promise((r) => setTimeout(r, 10));
		expect(client.callTool).not.toHaveBeenCalled();
	});

	it("does not call Commander when commanderAvailable is false", async () => {
		preDispatchClaim(false, 42, "planner");
		await new Promise((r) => setTimeout(r, 10));
		expect(client.callTool).not.toHaveBeenCalled();
	});
});

// ── Post-dispatch reconciliation logic ──────────────────────────────

/** Mirror of post-dispatch reconciliation from agent-team.ts runAgent() */
function postDispatchReconcile(
	commanderAvailable: boolean,
	taskId: number | undefined,
	agentName: string,
	status: "done" | "error",
	textChunks: string[],
	stderrBuf: string,
): void {
	if (commanderAvailable && taskId !== undefined) {
		const summary = textChunks.join("").trim().split("\n").pop() || agentName;
		if (status === "done") {
			commanderSync(async (client) => {
				await client.callTool("commander_task", {
					operation: "complete",
					task_id: taskId,
					result: summary,
				});
				await client.callTool("commander_mailbox", {
					operation: "send",
					from_agent: agentName,
					to_agent: "commander",
					body: `Task complete: ${summary}`,
					message_type: "status",
					task_id: taskId,
				});
			});
		} else {
			const errMsg = stderrBuf.trim() || summary || "Agent exited with error";
			commanderSync(async (client) => {
				await client.callTool("commander_task", {
					operation: "fail",
					task_id: taskId,
					error_message: errMsg,
				});
			});
		}
	}
}

describe("postDispatchReconcile", () => {
	let client: MockClient;

	beforeEach(() => {
		const g = globalThis as any;
		client = { callTool: vi.fn().mockResolvedValue({}) };
		g.__piCommanderAvailable = true;
		g.__piCommanderClient = client;
	});

	it("calls complete + mailbox on success", async () => {
		postDispatchReconcile(true, 42, "builder", "done", ["line1\n", "final line"], "");
		await new Promise((r) => setTimeout(r, 10));

		expect(client.callTool).toHaveBeenCalledWith("commander_task", {
			operation: "complete",
			task_id: 42,
			result: "final line",
		});
		expect(client.callTool).toHaveBeenCalledWith("commander_mailbox", {
			operation: "send",
			from_agent: "builder",
			to_agent: "commander",
			body: "Task complete: final line",
			message_type: "status",
			task_id: 42,
		});
	});

	it("calls fail on error with stderr", async () => {
		postDispatchReconcile(true, 42, "builder", "error", ["some output"], "oops failed");
		await new Promise((r) => setTimeout(r, 10));

		expect(client.callTool).toHaveBeenCalledWith("commander_task", {
			operation: "fail",
			task_id: 42,
			error_message: "oops failed",
		});
	});

	it("falls back to last text line when stderr is empty", async () => {
		postDispatchReconcile(true, 42, "builder", "error", ["first\nsecond"], "");
		await new Promise((r) => setTimeout(r, 10));

		expect(client.callTool).toHaveBeenCalledWith("commander_task", {
			operation: "fail",
			task_id: 42,
			error_message: "second",
		});
	});

	it("falls back to agentName when no text or stderr", async () => {
		postDispatchReconcile(true, 42, "builder", "error", [], "");
		await new Promise((r) => setTimeout(r, 10));

		expect(client.callTool).toHaveBeenCalledWith("commander_task", {
			operation: "fail",
			task_id: 42,
			error_message: "builder",
		});
	});

	it("no-ops when taskId is undefined", async () => {
		postDispatchReconcile(true, undefined, "builder", "done", ["done"], "");
		await new Promise((r) => setTimeout(r, 10));
		expect(client.callTool).not.toHaveBeenCalled();
	});

	it("no-ops when commanderAvailable is false", async () => {
		postDispatchReconcile(false, 42, "builder", "done", ["done"], "");
		await new Promise((r) => setTimeout(r, 10));
		expect(client.callTool).not.toHaveBeenCalled();
	});
});
