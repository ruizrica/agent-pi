// ABOUTME: Verifies that session_start is no longer dominated by synchronous
// ABOUTME: Commander housekeep work. The reconcile/reap path runs only when
// ABOUTME: there are open lifecycle intents to handle; the doctor warning
// ABOUTME: collection is deferred off the hot path so cold Pi launches finish
// ABOUTME: session_start without waiting on two ~2s board-wide bd scans.

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

	it("defers collectLifecycleWarnings off the synchronous session_start path", () => {
		// The warning collection runs a cmd housekeep --doctor (board-wide scan,
		// ~1.9s). It must not block session_start; it should be scheduled
		// asynchronously (setTimeout / queueMicrotask / Promise.resolve().then).
		const warningsCallIdx = sessionStartBlock.indexOf("collectLifecycleWarnings");
		expect(warningsCallIdx).toBeGreaterThan(-1);
		const localContext = sessionStartBlock.slice(Math.max(0, warningsCallIdx - 80), warningsCallIdx + 60);
		expect(localContext).toMatch(/setTimeout|queueMicrotask|Promise\.resolve\(\)\.then/);
	});

	it("caches recent doctor results with a TTL guard", () => {
		// A 60s cache prevents repeated Pi launches from re-scanning the board
		// every time. The implementation may hold the result in a module-scoped
		// variable along with a timestamp.
		expect(source).toMatch(/lastDoctorAt|doctorCacheTtl|DOCTOR_CACHE_TTL_MS|doctorCacheUntil/);
	});
});
