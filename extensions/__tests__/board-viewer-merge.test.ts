// ABOUTME: Verifies that gatherBoardData merges in-flight local tasks (no Commander mapping yet)
// ABOUTME: on top of Commander tasks instead of binary mode-switching when cmd is reachable.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const callToolMock = vi.fn();

vi.mock("../lib/commander/commander-cli-client.ts", () => ({
	isCommanderAvailable: () => true,
	getCommanderCliClient: () => ({ callTool: callToolMock }),
}));

import { gatherBoardData, __resetBoardViewerCacheForTests } from "../board-viewer.ts";

beforeEach(() => {
	callToolMock.mockReset();
	__resetBoardViewerCacheForTests();
	(globalThis as any).__piTaskList = undefined;
});

afterEach(() => {
	(globalThis as any).__piTaskList = undefined;
});

describe("gatherBoardData — local + commander merge", () => {
	it("returns Commander tasks plus local-only tasks (no double-counting)", async () => {
		callToolMock.mockResolvedValue({
			content: [{ type: "text", text: JSON.stringify([
				{ task_id: 1, description: "remote A", status: "pending" },
				{ task_id: 2, description: "remote B", status: "working" },
				{ task_id: 3, description: "remote C", status: "completed" },
			]) }],
		});

		(globalThis as any).__piTaskList = {
			tasks: [
				{ id: 100, text: "local-only X", status: "idle" },
				{ id: 101, text: "local-only Y", status: "inprogress" },
			],
			title: "local",
			remaining: 2,
			total: 2,
		};

		const data = await gatherBoardData();
		expect(data.tasks).toHaveLength(5);
		expect(data.connected).toBe(true);
	});

	it("marks local-only tasks with synced:false so UI can distinguish them", async () => {
		callToolMock.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify([]) }] });

		(globalThis as any).__piTaskList = {
			tasks: [{ id: 200, text: "queued local", status: "idle" }],
			title: "local",
			remaining: 1,
			total: 1,
		};

		const data = await gatherBoardData();
		const local = data.tasks.find((t: any) => t.task_id === 200);
		expect(local).toBeDefined();
		expect(local?.synced).toBe(false);
	});

	it("does not duplicate a local task that already has the same id as a Commander task", async () => {
		callToolMock.mockResolvedValue({
			content: [{ type: "text", text: JSON.stringify([
				{ task_id: 42, description: "shared", status: "working" },
			]) }],
		});

		(globalThis as any).__piTaskList = {
			tasks: [{ id: 42, text: "duplicate id", status: "idle" }],
			title: "local",
			remaining: 1,
			total: 1,
		};

		const data = await gatherBoardData();
		expect(data.tasks).toHaveLength(1);
		expect(data.tasks[0].task_id).toBe(42);
	});
});
