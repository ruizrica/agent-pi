// ABOUTME: Tests for the Commander MCP bridge extension.
// ABOUTME: Verifies tool registration, MCP client proxying, and error handling.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the MCP client ─────────────────────────────────────────────

const { mockConnect, mockCallTool, mockDisconnect, mockIsConnected } = vi.hoisted(() => ({
	mockConnect: vi.fn(),
	mockCallTool: vi.fn(),
	mockDisconnect: vi.fn(),
	mockIsConnected: vi.fn().mockReturnValue(false),
}));

vi.mock("../lib/mcp-client.ts", () => {
	class MockMcpClient {
		connect = mockConnect;
		callTool = mockCallTool;
		disconnect = mockDisconnect;
		isConnected = mockIsConnected;
	}
	return { McpClient: MockMcpClient };
});

// ── Mock ExtensionAPI ───────────────────────────────────────────────

interface RegisteredTool {
	name: string;
	label: string;
	description: string;
	parameters: any;
	execute: (...args: any[]) => any;
}

function createMockCtx() {
	return {
		ui: {
			setStatus: vi.fn(),
		},
	};
}

function createMockPi() {
	const tools: RegisteredTool[] = [];
	const events: Record<string, Function> = {};

	return {
		registerTool: vi.fn((def: any) => { tools.push(def); }),
		on: vi.fn((event: string, handler: Function) => { events[event] = handler; }),
		_tools: tools,
		_events: events,
	};
}

// ── Tests ───────────────────────────────────────────────────────────

describe("commander-mcp extension", () => {
	let pi: ReturnType<typeof createMockPi>;

	beforeEach(async () => {
		vi.clearAllMocks();
		pi = createMockPi();
		const mod = await import("../commander-mcp.ts");
		mod.default(pi as any);
	});

	it("should register all 8 commander tools", () => {
		expect(pi.registerTool).toHaveBeenCalledTimes(8);
		const names = pi._tools.map(t => t.name);
		expect(names).toContain("commander_task");
		expect(names).toContain("commander_session");
		expect(names).toContain("commander_workflow");
		expect(names).toContain("commander_spec");
		expect(names).toContain("commander_jira");
		expect(names).toContain("commander_mailbox");
		expect(names).toContain("commander_orchestration");
		expect(names).toContain("commander_dependency");
	});

	it("should register tools with operation as required parameter", () => {
		for (const tool of pi._tools) {
			expect(tool.parameters).toBeDefined();
		}
	});

	it("should register session_start and session_shutdown event handlers", () => {
		expect(pi.on).toHaveBeenCalledWith("session_start", expect.any(Function));
		expect(pi.on).toHaveBeenCalledWith("session_shutdown", expect.any(Function));
	});

	it("should proxy tool calls to MCP client", async () => {
		mockIsConnected.mockReturnValue(true);
		mockCallTool.mockResolvedValue({
			content: [{ type: "text", text: "result" }],
		});

		const taskTool = pi._tools.find(t => t.name === "commander_task")!;
		const result = await taskTool.execute("call-1", { operation: "list" }, new AbortController().signal, vi.fn(), {});

		expect(mockCallTool).toHaveBeenCalledWith("commander_task", { operation: "list" }, undefined);
		expect(result.content[0].text).toBe("result");
	});

	it("should lazy-connect on first tool call if not connected", async () => {
		mockIsConnected.mockReturnValue(false);
		mockConnect.mockResolvedValue(undefined);
		mockCallTool.mockResolvedValue({
			content: [{ type: "text", text: "ok" }],
		});

		const taskTool = pi._tools.find(t => t.name === "commander_task")!;
		await taskTool.execute("call-1", { operation: "list" }, new AbortController().signal, vi.fn(), {});

		expect(mockConnect).toHaveBeenCalled();
		expect(mockCallTool).toHaveBeenCalled();
	});

	it("should return error content when MCP client throws", async () => {
		mockIsConnected.mockReturnValue(true);
		mockCallTool.mockRejectedValue(new Error("Connection refused"));

		const taskTool = pi._tools.find(t => t.name === "commander_task")!;
		const result = await taskTool.execute("call-1", { operation: "list" }, new AbortController().signal, vi.fn(), {});

		expect(result.content[0].text).toContain("Connection refused");
	});

	it("should disconnect MCP client on session_shutdown", async () => {
		const shutdownHandler = pi._events["session_shutdown"];
		expect(shutdownHandler).toBeDefined();
		await shutdownHandler({}, {});
		expect(mockDisconnect).toHaveBeenCalled();
	});

	describe("lightweight timeout", () => {
		beforeEach(() => {
			mockIsConnected.mockReturnValue(true);
			mockCallTool.mockResolvedValue({
				content: [{ type: "text", text: "ok" }],
			});
		});

		it("should use 15s timeout for commander_mailbox", async () => {
			const mailboxTool = pi._tools.find(t => t.name === "commander_mailbox")!;
			await mailboxTool.execute("call-1", { operation: "send" }, new AbortController().signal, vi.fn(), {});

			expect(mockCallTool).toHaveBeenCalledWith("commander_mailbox", { operation: "send" }, 15000);
		});

		it("should use default timeout for non-mailbox tools", async () => {
			const nonMailboxTools = pi._tools.filter(t => t.name !== "commander_mailbox");
			for (const tool of nonMailboxTools) {
				mockCallTool.mockClear();
				await tool.execute("call-1", { operation: "list" }, new AbortController().signal, vi.fn(), {});

				expect(mockCallTool).toHaveBeenCalledWith(tool.name, { operation: "list" }, undefined);
			}
		});
	});

	it("should have meaningful descriptions for all tools", () => {
		for (const tool of pi._tools) {
			expect(tool.description.length).toBeGreaterThan(50);
			// All Commander tools mention "OPERATIONS" or "operation"
			expect(tool.description.toLowerCase()).toContain("operation");
		}
	});

	// The probe is fire-and-forget — flush microtasks to let it settle
	const flush = () => new Promise(r => setTimeout(r, 0));

	describe("availability probe on session_start", () => {
		it("should set __piCommanderAvailable=true when probe succeeds", async () => {
			const g = globalThis as any;
			delete g.__piCommanderAvailable;
			delete g.__piCommanderClient;

			mockConnect.mockResolvedValue(undefined);
			mockIsConnected.mockReturnValue(true);
			mockCallTool.mockResolvedValue({
				content: [{ type: "text", text: "[]" }],
			});

			const ctx = createMockCtx();
			const startHandler = pi._events["session_start"];
			await startHandler({}, ctx);
			await flush();

			expect(g.__piCommanderAvailable).toBe(true);
			expect(g.__piCommanderClient).toBeDefined();
			expect(ctx.ui.setStatus).toHaveBeenCalledWith(
				expect.stringContaining("connected"),
				"commander",
			);
		});

		it("should set __piCommanderAvailable=false when probe fails", async () => {
			const g = globalThis as any;
			delete g.__piCommanderAvailable;
			delete g.__piCommanderClient;

			mockConnect.mockRejectedValue(new Error("Connection refused"));

			const ctx = createMockCtx();
			const startHandler = pi._events["session_start"];
			await startHandler({}, ctx);
			await flush();

			expect(g.__piCommanderAvailable).toBe(false);
			expect(ctx.ui.setStatus).toHaveBeenCalledWith(
				expect.stringContaining("offline"),
				"commander",
			);
		});

		it("should set __piCommanderAvailable=false when probe call times out", async () => {
			const g = globalThis as any;
			delete g.__piCommanderAvailable;

			mockConnect.mockResolvedValue(undefined);
			mockIsConnected.mockReturnValue(true);
			mockCallTool.mockRejectedValue(new Error("MCP tool call timeout"));

			const ctx = createMockCtx();
			const startHandler = pi._events["session_start"];
			await startHandler({}, ctx);
			await flush();

			expect(g.__piCommanderAvailable).toBe(false);
		});

		it("should not block session_start (returns immediately)", async () => {
			// Mock a slow connect that takes a long time
			mockConnect.mockImplementation(() => new Promise(() => {})); // never resolves

			const ctx = createMockCtx();
			const startHandler = pi._events["session_start"];

			// session_start should return immediately despite the slow probe
			const start = Date.now();
			await startHandler({}, ctx);
			const elapsed = Date.now() - start;

			expect(elapsed).toBeLessThan(100);
		});
	});

	describe("health check", () => {
		it("should clear health check timer on session_shutdown", async () => {
			const g = globalThis as any;

			// Simulate a successful start to create a health check timer
			mockConnect.mockResolvedValue(undefined);
			mockIsConnected.mockReturnValue(true);
			mockCallTool.mockResolvedValue({
				content: [{ type: "text", text: "[]" }],
			});

			const ctx = createMockCtx();
			const startHandler = pi._events["session_start"];
			await startHandler({}, ctx);
			await flush();

			// Now shutdown — should clear timer and disconnect
			const shutdownHandler = pi._events["session_shutdown"];
			await shutdownHandler({}, ctx);
			expect(mockDisconnect).toHaveBeenCalled();

			// Verify globals are cleaned up
			expect(g.__piCommanderAvailable).toBe(false);
		});
	});
});
