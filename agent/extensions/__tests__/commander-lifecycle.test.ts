// ABOUTME: Tests for Commander lifecycle helpers — preClaimTask, postCompleteTask, postFailTask.
// ABOUTME: Validates correct Commander API calls for task claim, completion, and failure.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { preClaimTask, postCompleteTask, postFailTask } from "../lib/commander-lifecycle.ts";

interface MockClient {
	callTool: ReturnType<typeof vi.fn>;
}

describe("preClaimTask", () => {
	let client: MockClient;

	beforeEach(() => {
		client = { callTool: vi.fn().mockResolvedValue({}) };
	});

	it("calls claim and sends status mailbox", async () => {
		await preClaimTask(client, 42, "SCOUT");

		expect(client.callTool).toHaveBeenCalledWith("commander_task", {
			operation: "claim",
			task_id: 42,
			agent_name: "SCOUT",
		});
		expect(client.callTool).toHaveBeenCalledWith("commander_mailbox", {
			operation: "send",
			from_agent: "SCOUT",
			to_agent: "commander",
			body: "Starting task 42",
			message_type: "status",
			task_id: 42,
		});
	});

	it("calls claim before mailbox send", async () => {
		const callOrder: string[] = [];
		client.callTool.mockImplementation(async (tool: string) => {
			callOrder.push(tool);
			return {};
		});

		await preClaimTask(client, 10, "AGENT");
		expect(callOrder).toEqual(["commander_task", "commander_mailbox"]);
	});
});

describe("postCompleteTask", () => {
	let client: MockClient;

	beforeEach(() => {
		client = { callTool: vi.fn().mockResolvedValue({}) };
	});

	it("calls complete and sends status mailbox", async () => {
		await postCompleteTask(client, 42, "BUILDER", "All tests pass");

		expect(client.callTool).toHaveBeenCalledWith("commander_task", {
			operation: "complete",
			task_id: 42,
			result: "All tests pass",
		});
		expect(client.callTool).toHaveBeenCalledWith("commander_mailbox", {
			operation: "send",
			from_agent: "BUILDER",
			to_agent: "commander",
			body: "Task complete: All tests pass",
			message_type: "status",
			task_id: 42,
		});
	});
});

describe("postFailTask", () => {
	let client: MockClient;

	beforeEach(() => {
		client = { callTool: vi.fn().mockResolvedValue({}) };
	});

	it("calls fail with error message", async () => {
		await postFailTask(client, 42, "Something broke");

		expect(client.callTool).toHaveBeenCalledWith("commander_task", {
			operation: "fail",
			task_id: 42,
			error_message: "Something broke",
		});
	});

	it("does not send mailbox on failure (just the fail call)", async () => {
		await postFailTask(client, 42, "error");

		expect(client.callTool).toHaveBeenCalledTimes(1);
		expect(client.callTool).toHaveBeenCalledWith("commander_task", expect.objectContaining({
			operation: "fail",
		}));
	});
});
