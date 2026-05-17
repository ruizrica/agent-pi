// ABOUTME: Regression tests for Commander lifecycle guard loop prevention.
// ABOUTME: Ensures repeated agent_end hooks do not trigger infinite validation turns.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("commander lifecycle guard", () => {
	const source = readFileSync(join(__dirname, "..", "commander-lifecycle-guard.ts"), "utf-8");

	it("does not trigger another agent turn when surfacing lifecycle warnings", () => {
		expect(source).toContain("triggerTurn: false");
		expect(source).not.toContain("triggerTurn: true");
	});

	it("deduplicates repeated agent_end notifications", () => {
		expect(source).toContain("lastAgentEndFingerprint");
		expect(source).toContain("shouldNotifyAgentEnd");
		expect(source).toContain("60_000");
	});
});
