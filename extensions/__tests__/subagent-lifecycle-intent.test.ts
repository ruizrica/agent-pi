// ABOUTME: Verifies that subagent post-dispatch reconciliation records a lifecycle intent
// ABOUTME: whenever the Commander complete/fail call rejects, returns false, or is unreachable.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { listOpenLifecycleIntents } from "../lib/commander/lifecycle-intents.ts";
import { reconcileSubagentToCommander } from "../subagent-widget.ts";

interface MockClient {
	callTool: ReturnType<typeof vi.fn>;
}

beforeEach(() => {
	process.env.PI_LIFECYCLE_INTENTS_PATH = join(
		mkdtempSync(join(tmpdir(), "pi-subagent-intent-test-")),
		"intents.json",
	);
});

afterEach(() => {
	delete process.env.PI_LIFECYCLE_INTENTS_PATH;
});

describe("reconcileSubagentToCommander — orphan-task atomicity", () => {
	it("records a complete intent when postCompleteTask rejects", async () => {
		const client: MockClient = {
			callTool: vi.fn().mockRejectedValue(new Error("network down")),
		};

		await reconcileSubagentToCommander(
			{ status: "done" },
			42,
			"SA-1-builder",
			"all tests pass",
			client,
		);

		const open = listOpenLifecycleIntents();
		const intent = open.find(i => i.taskId === 42 && i.action === "complete");
		expect(intent).toBeDefined();
		expect(intent?.owner).toBe("SA-1-builder");
		expect(intent?.message).toBe("all tests pass");
	});

	it("records a fail intent when postFailTask rejects", async () => {
		const client: MockClient = {
			callTool: vi.fn().mockRejectedValue(new Error("connection reset")),
		};

		await reconcileSubagentToCommander(
			{ status: "error" },
			99,
			"SA-7-worker",
			"agent exited with code 1",
			client,
		);

		const open = listOpenLifecycleIntents();
		const intent = open.find(i => i.taskId === 99 && i.action === "fail");
		expect(intent).toBeDefined();
		expect(intent?.owner).toBe("SA-7-worker");
	});

	it("records a complete intent when postCompleteTask returns false after retries exhausted", async () => {
		// callTool always rejects → postCompleteTask catches internally and returns false.
		const client: MockClient = {
			callTool: vi.fn().mockRejectedValue(new Error("upstream down")),
		};

		await reconcileSubagentToCommander(
			{ status: "done" },
			17,
			"SA-3-scout",
			"summary",
			client,
		);

		const open = listOpenLifecycleIntents();
		const intent = open.find(i => i.taskId === 17 && i.action === "complete");
		expect(intent).toBeDefined();
	});

	it("records a fail intent when Commander client is unreachable (null client)", async () => {
		await reconcileSubagentToCommander(
			{ status: "error" },
			55,
			"SA-9-builder",
			"agent crashed",
			null,
		);

		const open = listOpenLifecycleIntents();
		const intent = open.find(i => i.taskId === 55 && i.action === "fail");
		expect(intent).toBeDefined();
	});

	it("does not record an intent on successful postCompleteTask", async () => {
		const client: MockClient = {
			callTool: vi.fn().mockResolvedValue({ ok: true }),
		};

		await reconcileSubagentToCommander(
			{ status: "done" },
			100,
			"SA-2-builder",
			"clean run",
			client,
		);

		const open = listOpenLifecycleIntents();
		const intent = open.find(i => i.taskId === 100);
		expect(intent).toBeUndefined();
	});

	it("is a no-op when cmdTaskId is undefined", async () => {
		const client: MockClient = {
			callTool: vi.fn().mockRejectedValue(new Error("should not be called")),
		};

		await reconcileSubagentToCommander(
			{ status: "done" },
			undefined,
			"SA-untracked",
			"summary",
			client,
		);

		const open = listOpenLifecycleIntents();
		expect(open).toHaveLength(0);
		expect(client.callTool).not.toHaveBeenCalled();
	});
});
