// ABOUTME: Verifies that when cmd is not on PATH, the kanban board, task store, and subagent
// ABOUTME: reconciler all silently fall back to local-only behavior — no error surfaces to the user.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("../lib/commander/commander-cli-client.ts", () => ({
	isCommanderAvailable: () => false,
	getCommanderCliClient: () => {
		throw new Error("test simulates cmd missing");
	},
}));

import { gatherBoardData, __resetBoardViewerCacheForTests } from "../board-viewer.ts";
import { reconcileSubagentToCommander } from "../subagent-widget.ts";
import {
	listOpenLifecycleIntents,
	recordLifecycleIntent,
} from "../lib/commander/lifecycle-intents.ts";
import { reconcileOpenLifecycleIntents } from "../commander-lifecycle-guard.ts";

beforeEach(() => {
	process.env.PI_LIFECYCLE_INTENTS_PATH = join(
		mkdtempSync(join(tmpdir(), "pi-cmd-absent-")),
		"intents.json",
	);
	__resetBoardViewerCacheForTests();
	(globalThis as any).__piTaskList = undefined;
});

afterEach(() => {
	delete process.env.PI_LIFECYCLE_INTENTS_PATH;
	(globalThis as any).__piTaskList = undefined;
});

describe("cmd absent — silent graceful fallback", () => {
	it("gatherBoardData returns local-mode data without throwing", async () => {
		(globalThis as any).__piTaskList = {
			tasks: [{ id: 1, text: "local x", status: "idle" }],
			title: "local",
			remaining: 1,
			total: 1,
		};
		const data = await gatherBoardData();
		expect(data.connected).toBe(false);
		expect(data.localMode).toBe(true);
		expect(data.tasks).toHaveLength(1);
	});

	it("gatherBoardData returns empty local data even with no local tasks set", async () => {
		const data = await gatherBoardData();
		expect(data.connected).toBe(false);
		expect(data.tasks).toEqual([]);
	});

	it("reconcileSubagentToCommander records intent when client is null", async () => {
		await reconcileSubagentToCommander({ status: "done" }, 77, "SA-x", "done", null);
		const open = listOpenLifecycleIntents();
		expect(open).toHaveLength(1);
		expect(open[0].taskId).toBe(77);
		expect(open[0].action).toBe("complete");
	});

	it("reconcileOpenLifecycleIntents retains intents (no error) when client is null", async () => {
		recordLifecycleIntent({ taskId: 88, action: "fail", message: "wait for cmd" });
		const result = await reconcileOpenLifecycleIntents(null);
		expect(result.retained).toBe(1);
		expect(result.reconciled).toBe(0);
		expect(listOpenLifecycleIntents()).toHaveLength(1);
	});
});
