// ABOUTME: Regression test for the silent-recovery contract of commander-lifecycle-guard.
// ABOUTME: The observability surface (agent_end pi.sendMessage nudge, ctx.ui.notify
// ABOUTME: warnings, doctor scan) was removed 2026-05-20 per Ricardo's option-2 call.
// ABOUTME: Recovery must run silently — only errors log to stderr.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("commander lifecycle guard — silent recovery", () => {
	const source = readFileSync(join(__dirname, "..", "commander-lifecycle-guard.ts"), "utf-8");

	it("does not call pi.sendMessage from agent_end (no validation nudge)", () => {
		expect(source).not.toContain("pi.sendMessage");
	});

	it("does not surface lifecycle warnings via ctx.ui.notify", () => {
		expect(source).not.toContain("Commander lifecycle recovery needed");
		expect(source).not.toContain("commander-lifecycle-validation");
	});

	it("does not collect doctor warnings (the noisy observability path is gone)", () => {
		expect(source).not.toContain("collectLifecycleWarnings");
		expect(source).not.toContain("DOCTOR_CACHE_TTL_MS");
	});

	it("still keeps the silent recovery primitives", () => {
		// These are the load-bearing parts and must stay.
		expect(source).toContain("reconcileOpenLifecycleIntents");
		expect(source).toContain("runReapStaleClaims");
	});
});
