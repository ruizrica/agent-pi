// ABOUTME: Phase 3.0 of Option 3 (contract-owner facade) — locks in atomicity for group:create.
// ABOUTME: The current emulated createTaskGroup silently returns task_ids.length < tasks.length
// ABOUTME: when a child create response lacks id/task_id — Pi's downstream then sets groupId
// ABOUTME: without mappings, manifesting as "Commander sync pending forever" in toggle UI.
// ABOUTME: This test pins the desired contract: partial success is loud failure, not silent loss.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { execFileMock } = vi.hoisted(() => ({
	execFileMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
	execFile: execFileMock,
}));

import { CommanderCliClient } from "../lib/commander/commander-cli-client.ts";
import { __resetIdentityCacheForTests } from "../agent-identity.ts";

describe("group:create atomicity (Phase 3.0 — Option 3 contract owner)", () => {
	beforeEach(() => {
		__resetIdentityCacheForTests();
		execFileMock.mockReset();
	});

	afterEach(() => {
		__resetIdentityCacheForTests();
	});

	it("throws when a child create response lacks both id and task_id (no silent partial success)", async () => {
		let callCount = 0;
		execFileMock.mockImplementation((_bin, _args, _opts, cb) => {
			callCount++;
			// Parent succeeds with id=100. Child response is missing id field entirely.
			if (callCount === 1) cb(null, JSON.stringify({ id: 100 }), "");
			else cb(null, JSON.stringify({ status: "created_but_no_id_field", emulated: false }), "");
		});
		const client = new CommanderCliClient({ bin: "cmd-test" });
		await expect(
			client.callTool("commander_task", {
				operation: "group:create",
				group_name: "Test",
				initiative_summary: "Test",
				tasks: [{ description: "Child task" }],
			}),
		).rejects.toThrow(/(atomicity|task_id|missing|child|id)/i);
	});

	it("throws when ONE of several children fails to return an id (partial success not allowed)", async () => {
		let callCount = 0;
		execFileMock.mockImplementation((_bin, _args, _opts, cb) => {
			callCount++;
			// Parent + first child succeed; second child returns no id (e.g. validator rejection)
			if (callCount === 1) cb(null, JSON.stringify({ id: 100 }), "");
			else if (callCount === 2) cb(null, JSON.stringify({ id: 101 }), "");
			else cb(null, JSON.stringify({ error: "rejected" }), "");
		});
		const client = new CommanderCliClient({ bin: "cmd-test" });
		await expect(
			client.callTool("commander_task", {
				operation: "group:create",
				group_name: "Test",
				initiative_summary: "Test",
				tasks: [{ description: "C1" }, { description: "C2" }],
			}),
		).rejects.toThrow();
	});

	it("succeeds normally when all children return valid ids (existing happy path preserved)", async () => {
		let nextId = 100;
		execFileMock.mockImplementation((_bin, _args, _opts, cb) => {
			cb(null, JSON.stringify({ id: nextId++ }), "");
		});
		const client = new CommanderCliClient({ bin: "cmd-test" });
		const result = await client.callTool("commander_task", {
			operation: "group:create",
			group_name: "Test",
			initiative_summary: "Test",
			tasks: [{ description: "C1" }, { description: "C2" }, { description: "C3" }],
		});
		const payload = JSON.parse(result.content[0].text);
		expect(payload.group_id).toBe(100);
		expect(payload.task_ids).toEqual([101, 102, 103]);
	});

	it("throws when the parent create response itself lacks id (no partial group with no parent id)", async () => {
		execFileMock.mockImplementation((_bin, _args, _opts, cb) => {
			cb(null, JSON.stringify({ status: "created_but_no_id_field" }), "");
		});
		const client = new CommanderCliClient({ bin: "cmd-test" });
		await expect(
			client.callTool("commander_task", {
				operation: "group:create",
				group_name: "Test",
				initiative_summary: "Test",
				tasks: [{ description: "C1" }],
			}),
		).rejects.toThrow(/(parent|group_id|task_id|missing|id)/i);
	});
});
