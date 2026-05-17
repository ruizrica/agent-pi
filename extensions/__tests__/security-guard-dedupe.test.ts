// ABOUTME: Regression tests for security guard duplicate alert suppression.
// ABOUTME: Prevents repeated identical guard cards from creating alert loops.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("security guard alert dedupe", () => {
	const source = readFileSync(join(__dirname, "..", "security-guard.ts"), "utf-8");

	it("throttles identical guard cards with a time-window fingerprint", () => {
		expect(source).toContain("recentGuardCardAt");
		expect(source).toContain("GUARD_CARD_DEDUP_WINDOW_MS = 60_000");
		expect(source).toContain("opts?.dedupeKey || `${action}|${detail}`");
		expect(source).toContain("nowMs - last < GUARD_CARD_DEDUP_WINDOW_MS");
	});

	it("does not clear cross-turn guard-card dedupe on input", () => {
		const inputHook = source.slice(source.indexOf('pi.on("input"'), source.indexOf('pi.on("session_start"'));
		expect(inputHook).toContain("shownContextCardKeys.clear()");
		expect(inputHook).not.toContain("recentGuardCardAt.clear()");
	});
});
