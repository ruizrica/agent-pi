// ABOUTME: Tests for Pi's minimal Commander lifecycle intent recovery cache.
// ABOUTME: Ensures failed in-flight cmd writes remain recoverable without duplicating board state.

import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	clearLifecycleIntent,
	listOpenLifecycleIntents,
	recordLifecycleIntent,
} from "../lib/commander/lifecycle-intents.ts";

function tempStore(): string {
	return join(mkdtempSync(join(tmpdir(), "pi-lifecycle-intents-")), "intents.json");
}

describe("lifecycle intents", () => {
	it("records and lists pending lifecycle intents", () => {
		const path = tempStore();
		recordLifecycleIntent({ taskId: 7, action: "complete", owner: "SA-1", message: "done" }, path);
		const intents = listOpenLifecycleIntents(path);
		expect(intents).toHaveLength(1);
		expect(intents[0]).toMatchObject({ id: "7:complete", taskId: 7, action: "complete", owner: "SA-1", attempts: 1 });
	});

	it("coalesces retries for the same task/action", () => {
		const path = tempStore();
		recordLifecycleIntent({ taskId: "agent-pi-1", action: "fail", message: "first" }, path);
		recordLifecycleIntent({ taskId: "agent-pi-1", action: "fail", message: "second" }, path);
		const intents = listOpenLifecycleIntents(path);
		expect(intents).toHaveLength(1);
		expect(intents[0]).toMatchObject({ id: "agent-pi-1:fail", attempts: 2, message: "second" });
	});

	it("clears completed intents", () => {
		const path = tempStore();
		recordLifecycleIntent({ taskId: 9, action: "cancel", message: "not needed" }, path);
		clearLifecycleIntent(9, "cancel", path);
		expect(listOpenLifecycleIntents(path)).toEqual([]);
	});
});
