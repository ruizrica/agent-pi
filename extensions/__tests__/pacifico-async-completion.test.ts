// ABOUTME: Static regression coverage for Pacifico advisor-style async completion behavior.
// ABOUTME: Ensures slash-command async jobs poll quietly and wake the assistant only on terminal result.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(__dirname, "..", "pacifico.ts"), "utf8");

describe("pacifico async completion notifier", () => {
	it("uses a dedicated completion custom type that is not filtered out of LLM context", () => {
		expect(source).toContain('const PACIFICO_JOB_COMPLETE_TYPE = "pacifico_job_complete"');
		expect(source).toContain('customType: PACIFICO_JOB_COMPLETE_TYPE');
		expect(source).toContain('m.customType === PACIFICO_MESSAGE_TYPE');
		expect(source).not.toContain('m.customType === PACIFICO_JOB_COMPLETE_TYPE');
	});

	it("polls async jobs on a quiet 30 second cadence", () => {
		expect(source).toContain("ASYNC_POLL_SCHEDULE");
		expect(source).toContain("intervalMs: 30_000");
		expect(source).not.toContain("intervalMs: 1_000");
		expect(source).not.toContain("intervalMs: 5_000");
	});

	it("wakes the assistant only when an async job reaches a terminal result", () => {
		expect(source).toContain("function emitJobComplete");
		expect(source).toContain("triggerTurn: true");
		expect(source).toContain('deliverAs: "followUp"');
		expect(source).toContain("emitJobComplete(pi, final)");
		expect(source).toContain("Stay silent for timeout/not-found/network polling failures");
	});

	it("keeps sync responses immediate and only registers the poller for async responses", () => {
		expect(source).toContain('if (result.kind === "sync")');
		expect(source).toContain("const meta = `_${r.provider} · ${r.model} · route ${r.route}_`;");
		expect(source).toContain("registerPoller(r.id, ctx)");
		const syncBranchIndex = source.indexOf('if (result.kind === "sync")');
		const pollerIndex = source.indexOf("registerPoller(r.id, ctx)", syncBranchIndex);
		expect(pollerIndex).toBeGreaterThan(syncBranchIndex);
	});
});
