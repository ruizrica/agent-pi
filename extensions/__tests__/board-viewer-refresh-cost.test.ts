// ABOUTME: Verifies the kanban board refresh fires exactly one cmd subprocess call (the task list)
// ABOUTME: per gatherBoardData invocation. Previously fired 5 parallel calls — 3 stubs + a discarded mailbox call.

import { describe, it, expect, vi, beforeEach } from "vitest";

const callToolMock = vi.fn();

vi.mock("../lib/commander/commander-cli-client.ts", () => ({
	isCommanderAvailable: () => true,
	getCommanderCliClient: () => ({ callTool: callToolMock }),
}));

import { gatherBoardData, __resetBoardViewerCacheForTests } from "../board-viewer.ts";

beforeEach(() => {
	callToolMock.mockReset();
	if (typeof __resetBoardViewerCacheForTests === "function") __resetBoardViewerCacheForTests();
});

describe("gatherBoardData — refresh cost", () => {
	it("invokes commander_task list exactly once per refresh", async () => {
		callToolMock.mockResolvedValue({
			content: [{ type: "text", text: JSON.stringify([{ task_id: 1, status: "pending", description: "x" }]) }],
		});

		await gatherBoardData();

		expect(callToolMock).toHaveBeenCalledTimes(1);
		const [tool, params] = callToolMock.mock.calls[0];
		expect(tool).toBe("commander_task");
		expect(params).toEqual(expect.objectContaining({ operation: "list" }));
	});

	it("does not call commander_mailbox, commander_orchestration, commander_dependency, or commander_task group:list", async () => {
		callToolMock.mockResolvedValue({
			content: [{ type: "text", text: JSON.stringify([]) }],
		});

		await gatherBoardData();

		const tools = callToolMock.mock.calls.map((c) => c[0]);
		expect(tools).not.toContain("commander_mailbox");
		expect(tools).not.toContain("commander_orchestration");
		expect(tools).not.toContain("commander_dependency");
		const groupListCall = callToolMock.mock.calls.find((c) => {
			const params = c[1] as any;
			return c[0] === "commander_task" && params?.operation === "group:list";
		});
		expect(groupListCall).toBeUndefined();
	});

	it("reuses cached task list within 1s TTL window", async () => {
		callToolMock.mockResolvedValue({
			content: [{ type: "text", text: JSON.stringify([]) }],
		});

		await gatherBoardData();
		await gatherBoardData();
		// Cache hit: only one subprocess call across two refreshes
		expect(callToolMock).toHaveBeenCalledTimes(1);
	});
});
