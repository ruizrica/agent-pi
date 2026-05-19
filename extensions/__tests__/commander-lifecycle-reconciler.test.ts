// ABOUTME: Verifies that the session-start reconciler retries open lifecycle intents,
// ABOUTME: clears them on success, retains them on failure (attempts++), and marks tasks failed after max-attempts.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	recordLifecycleIntent,
	listOpenLifecycleIntents,
	readLifecycleIntents,
} from "../lib/commander/lifecycle-intents.ts";
import { reconcileOpenLifecycleIntents } from "../commander-lifecycle-guard.ts";

interface MockClient {
	callTool: ReturnType<typeof vi.fn>;
}

let intentsPath: string;

beforeEach(() => {
	intentsPath = join(mkdtempSync(join(tmpdir(), "pi-reconciler-test-")), "intents.json");
	process.env.PI_LIFECYCLE_INTENTS_PATH = intentsPath;
});

afterEach(() => {
	delete process.env.PI_LIFECYCLE_INTENTS_PATH;
});

describe("reconcileOpenLifecycleIntents — session-start atomic recovery", () => {
	it("clears intents whose retry succeeds", async () => {
		recordLifecycleIntent({ taskId: 10, action: "complete", owner: "SA-1", message: "ok" });
		recordLifecycleIntent({ taskId: 11, action: "fail", owner: "SA-2", message: "err" });

		const client: MockClient = { callTool: vi.fn().mockResolvedValue({}) };
		const result = await reconcileOpenLifecycleIntents(client as any);

		expect(result.reconciled).toBe(2);
		expect(result.retained).toBe(0);
		expect(listOpenLifecycleIntents()).toHaveLength(0);
	});

	it("retains intents whose retry fails and bumps attempts", async () => {
		recordLifecycleIntent({ taskId: 20, action: "complete", owner: "SA-1", message: "boom" });

		const client: MockClient = { callTool: vi.fn().mockRejectedValue(new Error("upstream still down")) };
		const result = await reconcileOpenLifecycleIntents(client as any);

		expect(result.reconciled).toBe(0);
		expect(result.retained).toBe(1);
		const open = listOpenLifecycleIntents();
		expect(open).toHaveLength(1);
		expect(open[0].taskId).toBe(20);
		expect(open[0].attempts).toBeGreaterThanOrEqual(2);
	});

	it("marks task failed and clears intent after max attempts exhausted", async () => {
		// Seed intent with 4 prior attempts; one more failure pushes it to 5 (default cap)
		for (let i = 0; i < 4; i++) {
			recordLifecycleIntent({ taskId: 30, action: "complete", owner: "SA-3", message: "many tries" });
		}
		expect(readLifecycleIntents().intents.find(i => i.taskId === 30)?.attempts).toBe(4);

		const client: MockClient = { callTool: vi.fn().mockRejectedValue(new Error("permanent")) };
		const result = await reconcileOpenLifecycleIntents(client as any, { maxAttempts: 5 });

		expect(result.exhausted).toBe(1);
		// Should have attempted a cmd task update --status failed
		const failCall = client.callTool.mock.calls.find(c => {
			const params = c[1] as any;
			return params?.operation === "fail" || params?.operation === "update";
		});
		expect(failCall).toBeDefined();
		// Intent is cleared after exhaustion
		expect(listOpenLifecycleIntents()).toHaveLength(0);
	});

	it("is a no-op when there are no open intents", async () => {
		const client: MockClient = { callTool: vi.fn() };
		const result = await reconcileOpenLifecycleIntents(client as any);

		expect(result.reconciled).toBe(0);
		expect(result.retained).toBe(0);
		expect(result.exhausted).toBe(0);
		expect(client.callTool).not.toHaveBeenCalled();
	});

	it("is a no-op when client is null (Commander unavailable)", async () => {
		recordLifecycleIntent({ taskId: 40, action: "complete", owner: "SA-4", message: "wait for cmd" });

		const result = await reconcileOpenLifecycleIntents(null);

		expect(result.reconciled).toBe(0);
		expect(result.retained).toBe(1);
		// Intent persists for next session
		expect(listOpenLifecycleIntents()).toHaveLength(1);
	});

	it("handles a mix of succeeding and failing intents in one pass", async () => {
		recordLifecycleIntent({ taskId: 50, action: "complete", owner: "SA-A", message: "ok" });
		recordLifecycleIntent({ taskId: 51, action: "fail", owner: "SA-B", message: "stays" });
		recordLifecycleIntent({ taskId: 52, action: "complete", owner: "SA-C", message: "also ok" });

		const callsByTask = new Map<number, boolean>([[50, true], [51, false], [52, true]]);
		const client: MockClient = {
			callTool: vi.fn().mockImplementation((_tool: string, params: any) => {
				const taskId = params?.task_id as number;
				if (callsByTask.get(taskId)) return Promise.resolve({});
				return Promise.reject(new Error(`task ${taskId} still down`));
			}),
		};

		const result = await reconcileOpenLifecycleIntents(client as any);
		expect(result.reconciled).toBe(2);
		expect(result.retained).toBe(1);
		const open = listOpenLifecycleIntents();
		expect(open).toHaveLength(1);
		expect(open[0].taskId).toBe(51);
	});
});
