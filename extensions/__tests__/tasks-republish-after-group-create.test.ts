// ABOUTME: Asserts that tasks.ts republishes syncState to globalThis after every
// ABOUTME: group:create lambda completes — so the commander-tracker reconciler and
// ABOUTME: subsequent toggle messages see the freshly populated mappings without
// ABOUTME: waiting for the next UI event (the prior code mutated a closure-local
// ABOUTME: var but left g.__piTaskList.__syncState pointing at the pre-resolve
// ABOUTME: object, which made fast new-list → toggle flows report "sync pending"
// ABOUTME: even after the create had landed).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tasksSource = readFileSync(resolve(__dirname, "../tasks.ts"), "utf-8");

function lambdaBodies(source: string): string[] {
	const bodies: string[] = [];
	const marker = 'syncToCommander("group-create"';
	let cursor = 0;
	while (true) {
		const start = source.indexOf(marker, cursor);
		if (start === -1) break;
		// Walk forward to the matching closing brace+paren-paren for this lambda.
		// We rely on a balanced brace count starting from the first `{` after the marker.
		const firstBrace = source.indexOf("{", start);
		let depth = 0;
		let end = firstBrace;
		for (let i = firstBrace; i < source.length; i++) {
			const ch = source[i];
			if (ch === "{") depth++;
			else if (ch === "}") {
				depth--;
				if (depth === 0) { end = i + 1; break; }
			}
		}
		bodies.push(source.slice(start, end));
		cursor = end;
	}
	return bodies;
}

describe("group:create lambdas republish syncState to globalThis", () => {
	// Post-Phase-1 (lifecycle consolidation): the duplicated lambdas now route through
	// executeGroupCreate in commander-sync.ts. The republish-on-resolve contract is
	// expressed via the onResolved callback both call sites pass. The success/parse-failure
	// branching itself is covered by commander-sync-execute-group-create.test.ts.
	//
	// All three tests below are structural — they assert that tasks.ts wires the
	// executeGroupCreate helper with an onResolved callback that calls
	// publishSyncStateNow(). The publish hook lives inside the default-exported
	// extension closure and is not independently importable, so the wiring is the
	// only observable surface from outside the closure. Helper behavior itself is
	// covered behaviorally in commander-sync-execute-group-create.test.ts.
	const bodies = lambdaBodies(tasksSource);

	// structural — asserts file wiring; helper behavior is covered by commander-sync-execute-group-create.test.ts.
	it("finds at least two group:create lambdas in tasks.ts", () => {
		expect(bodies.length).toBeGreaterThanOrEqual(2);
	});

	// structural — asserts the call sites route through executeGroupCreate; helper behavior is covered separately.
	it("each lambda routes through the executeGroupCreate helper", () => {
		for (const body of bodies) {
			expect(body).toContain("executeGroupCreate(");
		}
	});

	// structural — asserts the onResolved callback in tasks.ts calls the closure-local publishSyncStateNow(); the helper's onResolved invariant is covered behaviorally.
	it("each lambda's onResolved callback republishes syncState", () => {
		for (const body of bodies) {
			// onResolved is the single republish hook the helper invokes on success,
			// parse-failure, AND catch paths — so one assertion covers all three.
			expect(body).toMatch(/onResolved:\s*\(next\)\s*=>\s*\{[^}]*publishSyncStateNow\(\)/);
		}
	});
});
