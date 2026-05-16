// ABOUTME: Tests for the Commander CLI client adapter.
// ABOUTME: Verifies cmd argv mapping and callTool-compatible response wrapping.
// ABOUTME: Includes identity flag injection tests for insert-at-position-2 behavior.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { execFileMock } = vi.hoisted(() => ({
	execFileMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
	execFile: execFileMock,
}));

import { CommanderCliClient } from "../lib/commander/commander-cli-client.ts";
import { __resetIdentityCacheForTests } from "../agent-identity.ts";

function mockExec(stdout: unknown = {}) {
	execFileMock.mockImplementation((_bin, _args, _opts, cb) => {
		cb(null, typeof stdout === "string" ? stdout : JSON.stringify(stdout), "");
	});
}

function text(result: any): string {
	return result.content[0].text;
}

describe("CommanderCliClient", () => {
	beforeEach(() => {
		__resetIdentityCacheForTests();
		execFileMock.mockReset();
	});

	afterEach(() => {
		__resetIdentityCacheForTests();
	});

	it("probes cmd task list on connect with identity flags inserted at position 2", async () => {
		mockExec([]);
		const client = new CommanderCliClient({ bin: "cmd-test" });
		await client.connect();
		expect(client.isConnected()).toBe(true);
		expect(execFileMock).toHaveBeenCalledWith(
			"cmd-test",
			["task", "list", "--runtime", "pi", "--model", "unknown", "--json", "--no-color", "--limit", "1"],
			expect.any(Object),
			expect.any(Function),
		);
	});

	it("maps commander_task list to cmd task list with identity at position 2", async () => {
		mockExec([{ id: 7, description: "Do it" }]);
		const client = new CommanderCliClient({ bin: "cmd-test" });
		const result = await client.callTool("commander_task", { operation: "list", limit: 10 });
		expect(execFileMock).toHaveBeenCalledWith(
			"cmd-test",
			["task", "list", "--runtime", "pi", "--model", "unknown", "--json", "--no-color", "--limit", "10", "--all"],
			expect.any(Object),
			expect.any(Function),
		);
		expect(JSON.parse(text(result))).toEqual({ tasks: [{ id: 7, description: "Do it" }] });
	});

	it("maps commander_task create to cmd task add with identity inserted after subcommand", async () => {
		mockExec({ id: 42, status: "pending" });
		const client = new CommanderCliClient({ bin: "cmd-test" });
		const result = await client.callTool("commander_task", { operation: "create", description: "Build", status: "pending" });
		expect(execFileMock).toHaveBeenCalledWith(
			"cmd-test",
			["task", "add", "--runtime", "pi", "--model", "unknown", "Build", "--json", "--no-color", "--status", "pending"],
			expect.any(Object),
			expect.any(Function),
		);
		expect(JSON.parse(text(result)).task_id).toBe(42);
	});

	it("maps title, mission brief, labels, and parent on create with identity at position 2", async () => {
		mockExec({ id: 43, status: "pending" });
		const client = new CommanderCliClient({ bin: "cmd-test" });
		await client.callTool("commander_task", {
			operation: "create",
			description: "Mission body",
			title: "Mission Title",
			mission_brief: "Mission body",
			labels: ["initiative-root"],
			group_id: 12,
			status: "pending",
		});
		expect(execFileMock).toHaveBeenCalledWith(
			"cmd-test",
			[
				"task", "add", "--runtime", "pi", "--model", "unknown",
				"Mission body", "--json", "--no-color",
				"--status", "pending",
				"--title", "Mission Title",
				"--mission-brief", "Mission body",
				"--labels", "initiative-root",
				"--parent", "12",
			],
			expect.any(Object),
			expect.any(Function),
		);
	});

	it("uses initiative_summary as root mission brief during group:create with identity at position 2", async () => {
		let nextId = 100;
		execFileMock.mockImplementation((_bin, _args, _opts, cb) => {
			cb(null, JSON.stringify({ id: nextId++ }), "");
		});
		const client = new CommanderCliClient({ bin: "cmd-test" });
		const result = await client.callTool("commander_task", {
			operation: "group:create",
			group_name: "Mission Title",
			initiative_summary: "Mission body",
			tasks: [{ description: "Child task" }],
		});

		expect(execFileMock).toHaveBeenNthCalledWith(
			1,
			"cmd-test",
			[
				"task", "add", "--runtime", "pi", "--model", "unknown",
				"Mission body", "--json", "--no-color",
				"--status", "pending",
				"--title", "Mission Title",
				"--mission-brief", "Mission body",
				"--labels", "initiative-root",
			],
			expect.any(Object),
			expect.any(Function),
		);
		expect(execFileMock).toHaveBeenNthCalledWith(
			2,
			"cmd-test",
			["task", "add", "--runtime", "pi", "--model", "unknown", "Child task", "--json", "--no-color", "--status", "pending", "--parent", "100"],
			expect.any(Object),
			expect.any(Function),
		);
		expect(JSON.parse(text(result))).toEqual({ group_id: 100, task_ids: [101], emulated: true });
	});

	it("maps claim to a working status update with identity at position 2", async () => {
		mockExec({ id: 9, updated: { status: "working" } });
		const client = new CommanderCliClient({ bin: "cmd-test" });
		await client.callTool("commander_task", { operation: "claim", task_id: 9 });
		expect(execFileMock).toHaveBeenCalledWith(
			"cmd-test",
			["task", "update", "--runtime", "pi", "--model", "unknown", "9", "--json", "--no-color", "--status", "working"],
			expect.any(Object),
			expect.any(Function),
		);
	});

	it("returns structured unsupported responses without identity injection", async () => {
		const client = new CommanderCliClient({ bin: "cmd-test" });
		const result = await client.callTool("commander_orchestration", { operation: "agent:list" });
		expect(JSON.parse(text(result))).toMatchObject({ unsupported: true, tool: "commander_orchestration" });
		expect(execFileMock).not.toHaveBeenCalled();
	});

	it("surfaces cmd failures", async () => {
		execFileMock.mockImplementation((_bin, _args, _opts, cb) => cb(new Error("missing"), "", "cmd not found"));
		const client = new CommanderCliClient({ bin: "cmd-test" });
		await expect(client.connect()).rejects.toThrow("cmd not found");
	});

	describe("withIdentity - position 2 insertion and environment variables", () => {
		it("inserts identity at position 2 for task list", async () => {
			mockExec([]);
			const client = new CommanderCliClient({ bin: "cmd-test" });
			await client.callTool("commander_task", { operation: "list" });
			const [, , arg2, arg3, arg4, arg5] = execFileMock.mock.calls[0][1];
			expect([arg2, arg3, arg4, arg5]).toEqual(["--runtime", "pi", "--model", "unknown"]);
		});

		it("inserts identity at position 2 for mailbox send with trailing positionals", async () => {
			mockExec({});
			const client = new CommanderCliClient({ bin: "cmd-test" });
			await client.callTool("commander_mailbox", {
				operation: "send",
				to_agent: "agent",
				message_type: "status",
				body: "hello",
			});
			const args = execFileMock.mock.calls[0][1];
			// Should be: ["mailbox", "send", "--runtime", "pi", "--model", "unknown", "agent", "status", "hello"]
			expect(args[0]).toBe("mailbox");
			expect(args[1]).toBe("send");
			expect(args[2]).toBe("--runtime");
			expect(args[3]).toBe("pi");
			expect(args[4]).toBe("--model");
			expect(args[5]).toBe("unknown");
			expect(args.slice(6)).toContain("agent");  // positionals stay at tail
		});

		it("respects PI_RUNTIME_LABEL environment variable", async () => {
			const prev = process.env.PI_RUNTIME_LABEL;
			try {
				process.env.PI_RUNTIME_LABEL = "custom-runtime";
				__resetIdentityCacheForTests();  // Force re-read of env
				mockExec([]);
				const client = new CommanderCliClient({ bin: "cmd-test" });
				await client.callTool("commander_task", { operation: "list" });
				const args = execFileMock.mock.calls[0][1];
				const idx = args.indexOf("--runtime");
				expect(args[idx + 1]).toBe("custom-runtime");
			} finally {
				if (prev !== undefined) process.env.PI_RUNTIME_LABEL = prev;
				else delete process.env.PI_RUNTIME_LABEL;
				__resetIdentityCacheForTests();
			}
		});

		it("respects PI_MODEL environment variable", async () => {
			const prev = process.env.PI_MODEL;
			try {
				process.env.PI_MODEL = "gpt-4-turbo";
				__resetIdentityCacheForTests();  // Force re-read of env
				mockExec([]);
				const client = new CommanderCliClient({ bin: "cmd-test" });
				await client.callTool("commander_task", { operation: "list" });
				const args = execFileMock.mock.calls[0][1];
				const idx = args.indexOf("--model");
				expect(args[idx + 1]).toBe("gpt-4-turbo");
			} finally {
				if (prev !== undefined) process.env.PI_MODEL = prev;
				else delete process.env.PI_MODEL;
				__resetIdentityCacheForTests();
			}
		});

		it("skips identity injection when --runtime is already present", async () => {
			mockExec([]);
			const client = new CommanderCliClient({ bin: "cmd-test" });
			// Pass identity in the operation params to cause it to appear in the final argv
			const result = await client.callTool("commander_task", {
				operation: "list",
				// Inject by making a custom call
			});
			// Simpler approach: test applyCmdIdentityFlags directly
			const { applyCmdIdentityFlags } = await import("../agent-identity.ts");
			const argsWithIdentity = ["task", "list", "--runtime", "declared", "--model", "declared"];
			const result2 = applyCmdIdentityFlags(argsWithIdentity);
			expect(result2).toEqual(argsWithIdentity);  // unchanged
		});

		it("handles single-element argv correctly", async () => {
			const { applyCmdIdentityFlags } = await import("../agent-identity.ts");
			const result = applyCmdIdentityFlags(["whoami"]);
			// Should insert at position 1 (Math.min(2, 1) = 1)
			expect(result[0]).toBe("whoami");
			expect(result[1]).toBe("--runtime");
			expect(result[2]).toBe("pi");
			expect(result[3]).toBe("--model");
			expect(result[4]).toBe("unknown");
		});

		it("injects env-driven identity through recursive group:create path", async () => {
			const prevRuntime = process.env.PI_RUNTIME_LABEL;
			const prevModel = process.env.PI_MODEL;
			try {
				process.env.PI_RUNTIME_LABEL = "claude-code";
				process.env.PI_MODEL = "opus-4.7";
				__resetIdentityCacheForTests();
				
				let callCount = 0;
				execFileMock.mockImplementation((_bin, _args, _opts, cb) => {
					callCount++;
					cb(null, JSON.stringify({ id: 100 + callCount }), "");
				});
				
				const client = new CommanderCliClient({ bin: "cmd-test" });
				const result = await client.callTool("commander_task", {
					operation: "group:create",
					group_name: "Test Group",
					initiative_summary: "Test initiative",
					tasks: [{ description: "Child task 1" }, { description: "Child task 2" }],
				});
				
				// Verify both parent and children have env-driven identity injected
				expect(execFileMock).toHaveBeenCalledTimes(3);  // 1 parent + 2 children
				
				// Parent task add call
				const parentCall = execFileMock.mock.calls[0][1];
				const parentRuntimeIdx = parentCall.indexOf("--runtime");
				expect(parentRuntimeIdx).toBeGreaterThanOrEqual(0);
				expect(parentCall[parentRuntimeIdx + 1]).toBe("claude-code");
				const parentModelIdx = parentCall.indexOf("--model");
				expect(parentModelIdx).toBeGreaterThanOrEqual(0);
				expect(parentCall[parentModelIdx + 1]).toBe("opus-4.7");
				
				// First child task add call
				const child1Call = execFileMock.mock.calls[1][1];
				const child1RuntimeIdx = child1Call.indexOf("--runtime");
				expect(child1RuntimeIdx).toBeGreaterThanOrEqual(0);
				expect(child1Call[child1RuntimeIdx + 1]).toBe("claude-code");
				const child1ModelIdx = child1Call.indexOf("--model");
				expect(child1ModelIdx).toBeGreaterThanOrEqual(0);
				expect(child1Call[child1ModelIdx + 1]).toBe("opus-4.7");
				
				// Second child task add call
				const child2Call = execFileMock.mock.calls[2][1];
				const child2RuntimeIdx = child2Call.indexOf("--runtime");
				expect(child2RuntimeIdx).toBeGreaterThanOrEqual(0);
				expect(child2Call[child2RuntimeIdx + 1]).toBe("claude-code");
				const child2ModelIdx = child2Call.indexOf("--model");
				expect(child2ModelIdx).toBeGreaterThanOrEqual(0);
				expect(child2Call[child2ModelIdx + 1]).toBe("opus-4.7");
			} finally {
				if (prevRuntime !== undefined) process.env.PI_RUNTIME_LABEL = prevRuntime;
				else delete process.env.PI_RUNTIME_LABEL;
				if (prevModel !== undefined) process.env.PI_MODEL = prevModel;
				else delete process.env.PI_MODEL;
				__resetIdentityCacheForTests();
			}
		});
	});
});
