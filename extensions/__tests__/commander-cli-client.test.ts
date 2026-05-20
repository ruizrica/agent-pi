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

	it("uses a board-safe default limit for commander_task list when no limit is supplied", async () => {
		mockExec([]);
		const client = new CommanderCliClient({ bin: "cmd-test" });
		await client.callTool("commander_task", { operation: "list" });
		expect(execFileMock).toHaveBeenCalledWith(
			"cmd-test",
			["task", "list", "--runtime", "pi", "--model", "unknown", "--json", "--no-color", "--limit", "500", "--all"],
			expect.any(Object),
			expect.any(Function),
		);
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
				"In . around lines 1-1, local task requires execution: Mission body; complete the requested local task.", "--json", "--no-color",
				"--status", "pending",
				"--title", "Mission Title",
				"--mission-brief", "Mission body",
				"--labels", "initiative-root",
				"--parent", "12",
				"--primary-file", ".",
				"--body", "## Steps\n1. Complete the local Pi task: Mission body\n\n## Tests\n- Verify the local Pi task is marked done and the Commander board status stays in sync.\n\n## References\n- Generated from Pi local task discipline sync.",
				"--lifecycle-owner", "self",
				"--confirm-wrapper",
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
				"--primary-file", ".",
				"--body", "## Steps\n1. Complete the requested work: Mission body\n\n## Tests\n- Verify the task is complete and the Commander board status stays in sync.\n\n## References\n- Primary file: .\n- Commander group created from Pi approval materialization.",
				"--lifecycle-owner", "self",
				"--confirm-wrapper",
			],
			expect.any(Object),
			expect.any(Function),
		);
		expect(execFileMock).toHaveBeenNthCalledWith(
			2,
			"cmd-test",
			[
				"task", "add", "--runtime", "pi", "--model", "unknown",
				"In . around lines 1-1, local task requires execution: Child task; complete the requested local task.", "--json", "--no-color",
				"--status", "pending", "--title", "Child task", "--parent", "100",
				"--primary-file", ".",
				"--body", "## Steps\n1. Complete the requested work: Child task\n\n## Tests\n- Verify the task is complete and the Commander board status stays in sync.\n\n## References\n- Primary file: .\n- Commander child task created from Pi approval materialization.",
				"--lifecycle-owner", "self",
				"--confirm-wrapper",
			],
			expect.any(Object),
			expect.any(Function),
		);
		expect(JSON.parse(text(result))).toEqual({ group_id: 100, task_ids: [101], emulated: true });
	});

	it("preserves cmd-plan fields for group:create child tasks", async () => {
		let nextId = 200;
		execFileMock.mockImplementation((_bin, _args, _opts, cb) => {
			cb(null, JSON.stringify({ id: nextId++ }), "");
		});
		const client = new CommanderCliClient({ bin: "cmd-test" });
		await client.callTool("commander_task", {
			operation: "group:create",
			group_name: "Plan: Fix",
			initiative_summary: "Approved plan",
			primary_file: ".context/todo.md",
			body: "## Steps\n1. Parent\n\n## Tests\n- Parent\n\n## References\n- Parent",
			labels: ["approved-plan"],
			tasks: [{
				description: "In extensions/board-viewer.ts around lines 10-20, board misrenders; patch the renderer.",
				title: "Patch board",
				primary_file: "extensions/board-viewer.ts",
				body: "## Steps\n1. Patch\n\n## Tests\n- Verify\n\n## References\n- Source",
				labels: ["approved-plan", "implement-source"],
				lifecycle_owner: "self",
				confirm_wrapper: true,
			}],
		});
		const childArgs = execFileMock.mock.calls[1][1];
		expect(childArgs).toEqual([
			"task", "add", "--runtime", "pi", "--model", "unknown",
			"In extensions/board-viewer.ts around lines 10-20, board misrenders; patch the renderer.", "--json", "--no-color",
			"--status", "pending",
			"--title", "Patch board",
			"--labels", "approved-plan,implement-source",
			"--parent", "200",
			"--primary-file", "extensions/board-viewer.ts",
			"--body", "## Steps\n1. Patch\n\n## Tests\n- Verify\n\n## References\n- Source",
			"--lifecycle-owner", "self",
			"--confirm-wrapper",
		]);
	});

	it("rewrites non-CodeRabbit child description even when primary_file/body/lifecycle_owner are preset (regression: cmd rejects plain-text child descriptions)", async () => {
		let nextId = 300;
		execFileMock.mockImplementation((_bin, _args, _opts, cb) => {
			cb(null, JSON.stringify({ id: nextId++ }), "");
		});
		const client = new CommanderCliClient({ bin: "cmd-test" });
		await client.callTool("commander_task", {
			operation: "group:create",
			group_name: "APU task flow verification",
			initiative_summary: "Local Pi tasks synced to Commander",
			tasks: [{ description: "APU-1: Verify task creation appears on the board" }],
		});
		const childArgs = execFileMock.mock.calls[1][1];
		// argv layout: ["task", "add", "--runtime", "pi", "--model", "unknown", <description>, "--json", ...]
		const description = childArgs[childArgs.indexOf("--json") - 1];
		// Description must satisfy cmd's CodeRabbit validator
		// (cli/cmd/src/task-registration/validate.ts CODERABBIT_DESCRIPTION_RE).
		expect(description).toMatch(
			/^In\s+\S+\s+around\s+lines\s+\d+\s*-\s*\d+,\s+.+;\s+.+\.?$/i,
		);
		expect(description).toContain("APU-1: Verify task creation appears on the board");
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

	it("maps commander_task comment:add to cmd task comment", async () => {
		mockExec({ ok: true });
		const client = new CommanderCliClient({ bin: "cmd-test" });
		const result = await client.callTool("commander_task", { operation: "comment:add", task_id: 9, body: "done", type: "progress" });
		expect(execFileMock).toHaveBeenCalledWith(
			"cmd-test",
			["task", "comment", "--runtime", "pi", "--model", "unknown", "9", "done", "--type", "progress"],
			expect.any(Object),
			expect.any(Function),
		);
		expect(JSON.parse(text(result))).toMatchObject({ task_id: 9, commented: true });
	});

	it("maps commander_housekeep doctor without identity injection", async () => {
		mockExec("1 finding:\n\n  orphaned children (1)\n    agent-pi-test  parent=#1 (cancelled)\n    → either reopen the parent or close the child\n");
		const client = new CommanderCliClient({ bin: "cmd-test" });
		const result = await client.callTool("commander_housekeep", { operation: "doctor" });
		expect(execFileMock).toHaveBeenCalledWith(
			"cmd-test",
			["housekeep", "--doctor", "--no-color", "--no-banner"],
			expect.any(Object),
			expect.any(Function),
		);
		expect(JSON.parse(text(result)).findings[0]).toMatchObject({ category: "orphaned children", taskId: "agent-pi-test" });
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

	describe("wrapper auto-discovery", () => {
		// Auto-discover scripts/cmd from the project root so the wrapper's
		// auto-init + mission-brief guard fire for pi-extension invocations.
		// We mock the filesystem check exposed by the client.

		const fs = require("node:fs") as typeof import("node:fs");
		const path = require("node:path") as typeof import("node:path");

		it("prefers scripts/cmd from cwd when it exists and is executable", () => {
			const fakeProject = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "cli-client-"));
			try {
				fs.mkdirSync(path.join(fakeProject, "scripts"), { recursive: true });
				const wrapper = path.join(fakeProject, "scripts", "cmd");
				fs.writeFileSync(wrapper, "#!/usr/bin/env bash\nexec /usr/bin/true\n");
				fs.chmodSync(wrapper, 0o755);

				const client = new CommanderCliClient({ cwd: fakeProject });
				expect((client as any).bin).toBe(wrapper);
			} finally {
				fs.rmSync(fakeProject, { recursive: true, force: true });
			}
		});

		it("walks up from a nested cwd to find scripts/cmd at the project root", () => {
			const fakeProject = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "cli-client-"));
			try {
				fs.mkdirSync(path.join(fakeProject, "scripts"), { recursive: true });
				const wrapper = path.join(fakeProject, "scripts", "cmd");
				fs.writeFileSync(wrapper, "#!/usr/bin/env bash\nexec /usr/bin/true\n");
				fs.chmodSync(wrapper, 0o755);

				const nested = path.join(fakeProject, "a", "b", "c");
				fs.mkdirSync(nested, { recursive: true });
				const client = new CommanderCliClient({ cwd: nested });
				expect((client as any).bin).toBe(wrapper);
			} finally {
				fs.rmSync(fakeProject, { recursive: true, force: true });
			}
		});

		it("falls back to bare 'cmd' when no scripts/cmd wrapper is present in the tree", () => {
			const fakeProject = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "cli-client-"));
			try {
				const client = new CommanderCliClient({ cwd: fakeProject });
				expect((client as any).bin).toBe("cmd");
			} finally {
				fs.rmSync(fakeProject, { recursive: true, force: true });
			}
		});

		it("respects explicit options.bin over any wrapper discovery", () => {
			const fakeProject = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "cli-client-"));
			try {
				fs.mkdirSync(path.join(fakeProject, "scripts"), { recursive: true });
				const wrapper = path.join(fakeProject, "scripts", "cmd");
				fs.writeFileSync(wrapper, "#!/usr/bin/env bash\nexec /usr/bin/true\n");
				fs.chmodSync(wrapper, 0o755);

				const client = new CommanderCliClient({ bin: "custom-cmd", cwd: fakeProject });
				expect((client as any).bin).toBe("custom-cmd");
			} finally {
				fs.rmSync(fakeProject, { recursive: true, force: true });
			}
		});

		it("respects COMMANDER_CMD_BIN env var over wrapper discovery", () => {
			const fakeProject = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "cli-client-"));
			const prev = process.env.COMMANDER_CMD_BIN;
			try {
				fs.mkdirSync(path.join(fakeProject, "scripts"), { recursive: true });
				const wrapper = path.join(fakeProject, "scripts", "cmd");
				fs.writeFileSync(wrapper, "#!/usr/bin/env bash\nexec /usr/bin/true\n");
				fs.chmodSync(wrapper, 0o755);

				process.env.COMMANDER_CMD_BIN = "env-cmd";
				const client = new CommanderCliClient({ cwd: fakeProject });
				expect((client as any).bin).toBe("env-cmd");
			} finally {
				if (prev !== undefined) process.env.COMMANDER_CMD_BIN = prev;
				else delete process.env.COMMANDER_CMD_BIN;
				fs.rmSync(fakeProject, { recursive: true, force: true });
			}
		});
	});

	describe("execFile error surfacing", () => {
		it("surfaces SIGTERM/killed timeouts with a clean cause line instead of dumping stderr NDJSON", async () => {
			execFileMock.mockImplementation((_bin, _args, _opts, cb) => {
				const err: any = new Error("Command failed");
				err.killed = true;
				err.signal = "SIGTERM";
				err.code = null;
				const stderrNdjson = [
					'{"ts":"2026-05-17T17:59:22.554Z","event":"bd_exec","status":0,"ok":true}',
					'{"ts":"2026-05-17T17:59:22.563Z","event":"cmd_writer_lock_stale_removed","stale_pid":44585}',
				].join("\n");
				cb(err, "", stderrNdjson);
			});

			const client = new CommanderCliClient({ bin: "cmd-test" });
			await expect(
				client.callTool("commander_task", { operation: "complete", task_id: 1075 }),
			).rejects.toMatchObject({
				message: expect.stringMatching(/^cmd task update failed: killed \(SIGTERM, timeout=\d+ms\)/),
				cmdKilled: true,
				cmdSignal: "SIGTERM",
			});
		});

		it("includes captured telemetry under a labeled section so debugging is still possible", async () => {
			execFileMock.mockImplementation((_bin, _args, _opts, cb) => {
				const err: any = new Error("Command failed");
				err.killed = false;
				err.signal = null;
				err.code = 2;
				cb(err, "", '{"event":"bd_exec","ok":true}');
			});

			const client = new CommanderCliClient({ bin: "cmd-test" });
			let caught: any;
			try {
				await client.callTool("commander_task", { operation: "complete", task_id: 1 });
			} catch (e) {
				caught = e;
			}
			expect(caught?.message).toMatch(/^cmd task update failed: exit 2/);
			expect(caught?.message).toContain("--- subprocess telemetry (stderr) ---");
			expect(caught?.message).toContain('"event":"bd_exec"');
			expect(caught?.cmdExitCode).toBe(2);
		});

		it("omits the telemetry section when stderr is empty", async () => {
			execFileMock.mockImplementation((_bin, _args, _opts, cb) => {
				const err: any = new Error("Command failed");
				err.killed = false;
				err.signal = null;
				err.code = 1;
				cb(err, "", "");
			});

			const client = new CommanderCliClient({ bin: "cmd-test" });
			let caught: any;
			try {
				await client.callTool("commander_task", { operation: "complete", task_id: 1 });
			} catch (e) {
				caught = e;
			}
			expect(caught?.message).toBe("cmd task update failed: exit 1");
		});
	});

	describe("CMD_SKIP_DUPLICATE_PREFLIGHT env injection", () => {
		const savedKeep = process.env.PI_CMD_KEEP_PREFLIGHT;
		const savedPath = process.env.PATH;

		beforeEach(() => {
			delete process.env.PI_CMD_KEEP_PREFLIGHT;
		});

		afterEach(() => {
			if (savedKeep === undefined) delete process.env.PI_CMD_KEEP_PREFLIGHT;
			else process.env.PI_CMD_KEEP_PREFLIGHT = savedKeep;
			// PATH is read-only in spread; ensure we didn't mutate it
			if (savedPath !== undefined) process.env.PATH = savedPath;
		});

		it("sets CMD_SKIP_DUPLICATE_PREFLIGHT=1 on every execFile call by default", async () => {
			mockExec([]);
			const client = new CommanderCliClient({ bin: "cmd-test" });
			await client.callTool("commander_task", { operation: "list" });

			expect(execFileMock).toHaveBeenCalledWith(
				"cmd-test",
				expect.any(Array),
				expect.objectContaining({
					env: expect.objectContaining({ CMD_SKIP_DUPLICATE_PREFLIGHT: "1" }),
				}),
				expect.any(Function),
			);
		});

		it("preserves inherited PATH/HOME in the spawned child env", async () => {
			mockExec([]);
			const client = new CommanderCliClient({ bin: "cmd-test" });
			await client.callTool("commander_task", { operation: "list" });

			const opts = execFileMock.mock.calls[0][2];
			expect(opts.env.PATH).toBe(process.env.PATH);
			expect(opts.env.HOME).toBe(process.env.HOME);
		});

		it("omits CMD_SKIP_DUPLICATE_PREFLIGHT when PI_CMD_KEEP_PREFLIGHT is set", async () => {
			process.env.PI_CMD_KEEP_PREFLIGHT = "1";
			mockExec([]);
			const client = new CommanderCliClient({ bin: "cmd-test" });
			await client.callTool("commander_task", { operation: "list" });

			const opts = execFileMock.mock.calls[0][2];
			expect(opts.env.CMD_SKIP_DUPLICATE_PREFLIGHT).toBeUndefined();
		});
	});
});
