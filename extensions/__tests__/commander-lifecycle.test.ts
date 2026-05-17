// ABOUTME: Tests for Commander lifecycle helpers — preClaimTask, postCompleteTask, postFailTask.
// ABOUTME: Validates correct Commander API calls, retry behavior, and return values.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { preClaimTask, postCompleteTask, postFailTask } from "../lib/commander/commander-lifecycle.ts";

interface MockClient {
	callTool: ReturnType<typeof vi.fn>;
}

beforeEach(() => {
	process.env.PI_LIFECYCLE_INTENTS_PATH = join(mkdtempSync(join(tmpdir(), "pi-lifecycle-test-")), "intents.json");
});

afterEach(() => {
	delete process.env.PI_LIFECYCLE_INTENTS_PATH;
});

describe("preClaimTask", () => {
	let client: MockClient;

	beforeEach(() => {
		client = { callTool: vi.fn().mockResolvedValue({}) };
	});

	it("calls claim and sends status mailbox, returns true", async () => {
		const result = await preClaimTask(client, 42, "SCOUT");

		expect(result).toBe(true);
		expect(client.callTool).toHaveBeenCalledWith("commander_task", {
			operation: "claim",
			task_id: 42,
			agent_name: "SCOUT",
		}, expect.any(Number));
		// Mailbox is fire-and-forget, but still called
		expect(client.callTool).toHaveBeenCalledWith("commander_mailbox", expect.objectContaining({
			operation: "send",
			from_agent: "SCOUT",
		}), expect.any(Number));
	});

	it("retries once on first failure then succeeds", async () => {
		client.callTool
			.mockRejectedValueOnce(new Error("timeout"))
			.mockResolvedValue({});

		const result = await preClaimTask(client, 10, "AGENT");
		expect(result).toBe(true);
		// First attempt fails, second succeeds, then mailbox
		expect(client.callTool).toHaveBeenCalledTimes(3);
	});

	it("returns false after all retries exhausted", async () => {
		client.callTool.mockRejectedValue(new Error("permanent failure"));

		const result = await preClaimTask(client, 10, "AGENT");
		expect(result).toBe(false);
		// 2 attempts for claim (both fail)
		expect(client.callTool).toHaveBeenCalledTimes(2);
	});
});

describe("postCompleteTask", () => {
	let client: MockClient;

	beforeEach(() => {
		client = { callTool: vi.fn().mockResolvedValue({}) };
	});

	it("calls complete and sends status mailbox, returns true", async () => {
		const result = await postCompleteTask(client, 42, "BUILDER", "All tests pass");

		expect(result).toBe(true);
		expect(client.callTool).toHaveBeenCalledWith("commander_task", {
			operation: "comment:add",
			task_id: 42,
			body: "FINAL: All tests pass",
			type: "progress",
		}, expect.any(Number));
		expect(client.callTool).toHaveBeenCalledWith("commander_task", {
			operation: "complete",
			task_id: 42,
			result: "All tests pass",
		}, expect.any(Number));
		expect(client.callTool).toHaveBeenCalledWith("commander_mailbox", expect.objectContaining({
			operation: "send",
			from_agent: "BUILDER",
			body: "Task complete: All tests pass",
		}), expect.any(Number));
	});

	it("retries once on transient failure", async () => {
		client.callTool
			.mockRejectedValueOnce(new Error("connection reset"))
			.mockResolvedValue({});

		const result = await postCompleteTask(client, 42, "BUILDER", "done");
		expect(result).toBe(true);
	});

	it("returns false when all retries fail", async () => {
		client.callTool.mockRejectedValue(new Error("server down"));

		const result = await postCompleteTask(client, 42, "BUILDER", "done");
		expect(result).toBe(false);
	});
});

describe("postFailTask", () => {
	let client: MockClient;

	beforeEach(() => {
		client = { callTool: vi.fn().mockResolvedValue({}) };
	});

	it("calls fail with error message, returns true", async () => {
		const result = await postFailTask(client, 42, "Something broke");

		expect(result).toBe(true);
		expect(client.callTool).toHaveBeenCalledWith("commander_task", {
			operation: "fail",
			task_id: 42,
			error_message: "Something broke",
		}, expect.any(Number));
	});

	it("adds an error comment before marking failed", async () => {
		const result = await postFailTask(client, 42, "error");

		expect(result).toBe(true);
		expect(client.callTool).toHaveBeenCalledWith("commander_task", {
			operation: "comment:add",
			task_id: 42,
			body: "FAILED: error",
			type: "error",
		}, expect.any(Number));
		expect(client.callTool).toHaveBeenCalledWith("commander_task", expect.objectContaining({
			operation: "fail",
		}), expect.any(Number));
	});

	it("returns false when all retries fail", async () => {
		client.callTool.mockRejectedValue(new Error("unreachable"));

		const result = await postFailTask(client, 42, "error");
		expect(result).toBe(false);
	});
});
