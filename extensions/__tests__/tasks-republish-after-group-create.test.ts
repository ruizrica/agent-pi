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
	const bodies = lambdaBodies(tasksSource);

	it("finds at least two group:create lambdas in tasks.ts", () => {
		expect(bodies.length).toBeGreaterThanOrEqual(2);
	});

	it("each lambda republishes after applyGroupCreateResult (success path)", () => {
		for (const body of bodies) {
			expect(body).toContain("applyGroupCreateResult(syncState, localIds, parsed)");
			const applyIdx = body.indexOf("applyGroupCreateResult(syncState, localIds, parsed)");
			const remainder = body.slice(applyIdx);
			expect(remainder).toMatch(/publishCurrentTask\(|refreshWidget\(|publishSyncStateNow\(/);
		}
	});

	it("each lambda republishes on the markGroupCreateSettled (parse-failure) path", () => {
		for (const body of bodies) {
			const settledIdx = body.indexOf("markGroupCreateSettled(syncState)");
			expect(settledIdx).toBeGreaterThan(-1);
			const remainder = body.slice(settledIdx);
			expect(remainder).toMatch(/publishCurrentTask\(|refreshWidget\(|publishSyncStateNow\(/);
		}
	});
});
