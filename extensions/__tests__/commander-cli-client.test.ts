// ABOUTME: Tests for the Commander CLI client adapter.
// ABOUTME: Verifies cmd argv mapping and callTool-compatible response wrapping.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { execFileMock } = vi.hoisted(() => ({
	execFileMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
	execFile: execFileMock,
}));

import { CommanderCliClient } from "../lib/commander/commander-cli-client.ts";

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
		execFileMock.mockReset();
	});

	it("probes cmd task list on connect", async () => {
		mockExec([]);
		const client = new CommanderCliClient({ bin: "cmd-test" });
		await client.connect();
		expect(client.isConnected()).toBe(true);
		expect(execFileMock).toHaveBeenCalledWith(
			"cmd-test",
			["task", "list", "--json", "--no-color", "--limit", "1"],
			expect.any(Object),
			expect.any(Function),
		);
	});

	it("maps commander_task list to cmd task list and wraps tasks", async () => {
		mockExec([{ id: 7, description: "Do it" }]);
		const client = new CommanderCliClient({ bin: "cmd-test" });
		const result = await client.callTool("commander_task", { operation: "list", limit: 10 });
		expect(execFileMock).toHaveBeenCalledWith(
			"cmd-test",
			["task", "list", "--json", "--no-color", "--limit", "10", "--all"],
			expect.any(Object),
			expect.any(Function),
		);
		expect(JSON.parse(text(result))).toEqual({ tasks: [{ id: 7, description: "Do it" }] });
	});

	it("maps commander_task create to cmd task add and normalizes task_id", async () => {
		mockExec({ id: 42, status: "pending" });
		const client = new CommanderCliClient({ bin: "cmd-test" });
		const result = await client.callTool("commander_task", { operation: "create", description: "Build", status: "pending" });
		expect(execFileMock).toHaveBeenCalledWith(
			"cmd-test",
			["task", "add", "Build", "--json", "--no-color", "--status", "pending"],
			expect.any(Object),
			expect.any(Function),
		);
		expect(JSON.parse(text(result)).task_id).toBe(42);
	});

	it("maps title, mission brief, labels, and parent on create", async () => {
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
				"task", "add", "Mission body", "--json", "--no-color",
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

	it("uses initiative_summary as root mission brief during group:create", async () => {
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
				"task", "add", "Mission body", "--json", "--no-color",
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
			["task", "add", "Child task", "--json", "--no-color", "--status", "pending", "--parent", "100"],
			expect.any(Object),
			expect.any(Function),
		);
		expect(JSON.parse(text(result))).toEqual({ group_id: 100, task_ids: [101], emulated: true });
	});

	it("maps claim to a working status update", async () => {
		mockExec({ id: 9, updated: { status: "working" } });
		const client = new CommanderCliClient({ bin: "cmd-test" });
		await client.callTool("commander_task", { operation: "claim", task_id: 9 });
		expect(execFileMock).toHaveBeenCalledWith(
			"cmd-test",
			["task", "update", "9", "--json", "--no-color", "--status", "working"],
			expect.any(Object),
			expect.any(Function),
		);
	});

	it("returns structured unsupported responses", async () => {
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
});
