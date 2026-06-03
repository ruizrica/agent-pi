// ABOUTME: Tests for completeCommanderTaskDurable — durable task completion via the canonical
// ABOUTME: `complete` op plus a lifecycle intent that survives failure for session_start replay.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { completeCommanderTaskDurable } from "../lib/commander/commander-lifecycle.ts";
import { listOpenLifecycleIntents } from "../lib/commander/lifecycle-intents.ts";

interface MockClient {
	callTool: ReturnType<typeof vi.fn>;
}

beforeEach(() => {
	process.env.PI_LIFECYCLE_INTENTS_PATH = join(mkdtempSync(join(tmpdir(), "pi-lifecycle-durable-")), "intents.json");
});

afterEach(() => {
	delete process.env.PI_LIFECYCLE_INTENTS_PATH;
});

describe("completeCommanderTaskDurable", () => {
	let client: MockClient;

	beforeEach(() => {
		client = { callTool: vi.fn().mockResolvedValue({}) };
	});

	it("completes via the canonical `complete` op (identical to the reconciler replay) and clears the intent", async () => {
		const ok = await completeCommanderTaskDurable(client, 42, "all done");

		expect(ok).toBe(true);
		expect(client.callTool).toHaveBeenCalledWith("commander_task", {
			operation: "complete",
			task_id: 42,
			result: "all done",
		}, expect.any(Number));
		// On success the durable intent is cleared.
		expect(listOpenLifecycleIntents().find((i) => i.taskId === 42)).toBeUndefined();
	});

	it("retains a durable `complete` intent when the close fails (session_start replay recovers it)", async () => {
		client.callTool.mockRejectedValue(new Error("bd lock"));

		const ok = await completeCommanderTaskDurable(client, 99, "done");

		expect(ok).toBe(false);
		const open = listOpenLifecycleIntents().find((i) => i.taskId === 99);
		expect(open).toBeDefined();
		expect(open?.action).toBe("complete");
		// The retained message must match what the reconciler will replay as `result`.
		expect(open?.message).toBe("done");
	});

	it("never throws even when the client rejects", async () => {
		client.callTool.mockRejectedValue(new Error("boom"));
		await expect(completeCommanderTaskDurable(client, 7)).resolves.toBe(false);
	});
});
