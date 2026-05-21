// ABOUTME: Verifies that session_start is not dominated by synchronous Commander
// ABOUTME: housekeep work. The reconcile/reap path runs only when there are open
// ABOUTME: lifecycle intents to handle — every other cold launch must pay zero
// ABOUTME: board-wide bd scan cost. Doctor-warning observability was removed
// ABOUTME: 2026-05-20 (option 2: keep recovery, drop noisy notifications); the
// ABOUTME: tests that pinned its presence are gone too.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "..", "commander-lifecycle-guard.ts"), "utf-8");

function extract(start: string, end: string): string {
	const s = source.indexOf(start);
	if (s === -1) return "";
	const e = source.indexOf(end, s + start.length);
	if (e === -1) return source.slice(s);
	return source.slice(s, e);
}

describe("commander lifecycle guard — fast session_start", () => {
	const sessionStartBlock = extract('pi.on("session_start"', 'pi.on("agent_end"');

	it("located the session_start handler block", () => {
		expect(sessionStartBlock.length).toBeGreaterThan(50);
	});

	it("gates reconcile + reap behind a listOpenLifecycleIntents check (skips the work when no intents are open)", () => {
		// Both reconcile and reap must be inside a code path that first checks
		// for open intents — otherwise every cold Pi launch pays the ~4s reap
		// cost even when nothing needs reconciling.
		expect(sessionStartBlock).toMatch(/listOpenLifecycleIntents\s*\(/);
		const intentsCheckIdx = sessionStartBlock.search(/listOpenLifecycleIntents\s*\(/);
		const reconcileIdx = sessionStartBlock.indexOf("reconcileOpenLifecycleIntents");
		const reapIdx = sessionStartBlock.indexOf("runReapStaleClaims");
		expect(reconcileIdx).toBeGreaterThan(intentsCheckIdx);
		expect(reapIdx).toBeGreaterThan(intentsCheckIdx);
	});
});
