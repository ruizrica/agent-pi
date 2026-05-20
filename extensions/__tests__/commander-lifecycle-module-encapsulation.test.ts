// ABOUTME: Phase 3 of the ORIGINAL Option 2 plan — encapsulation contract for a lifecycle module.
// ABOUTME: Skipped after pivot to Option 3 (contract-owner facade). Kept for reference; safe to delete.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const extensionsRoot = join(__dirname, "..");

const LIFECYCLE_MODULE_FILES = new Set<string>([
	join(extensionsRoot, "lib", "commander", "commander-lifecycle.ts"),
	join(extensionsRoot, "lib", "commander", "lifecycle-intents.ts"),
	join(extensionsRoot, "lib", "commander", "lifecycle", "index.ts"),
	join(extensionsRoot, "commander-lifecycle-guard.ts"),
]);

const INTERNAL_PATH_PATTERNS = [
	/from\s+["'][^"']*lifecycle-intents(\.ts)?["']/,
	/from\s+["'][^"']*\/commander-lifecycle(\.ts)?["']/,
];

function* walkProductionTsFiles(dir: string): IterableIterator<string> {
	for (const entry of readdirSync(dir)) {
		if (entry === "__tests__" || entry === "node_modules" || entry.startsWith(".")) continue;
		const full = join(dir, entry);
		const stat = statSync(full);
		if (stat.isDirectory()) {
			yield* walkProductionTsFiles(full);
		} else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts") && !entry.endsWith(".d.ts")) {
			yield full;
		}
	}
}

describe.skip("Phase 3 (Option 2, superseded by Option 3): lifecycle module encapsulation", () => {
	it("exposes a lifecycle module index at extensions/lib/commander/lifecycle/index.ts", () => {
		const indexPath = join(extensionsRoot, "lib", "commander", "lifecycle", "index.ts");
		const source = readFileSync(indexPath, "utf-8");
		expect(source).toMatch(/export\s+\{[^}]*MAX_INTENT_ATTEMPTS/);
		expect(source).toMatch(/export\s+\{[^}]*recordLifecycleIntent/);
		expect(source).toMatch(/export\s+\{[^}]*listOpenLifecycleIntents/);
	});

	it("no production file outside the lifecycle module imports lifecycle internals directly", () => {
		const offenders: string[] = [];
		for (const file of walkProductionTsFiles(extensionsRoot)) {
			if (LIFECYCLE_MODULE_FILES.has(file)) continue;
			const source = readFileSync(file, "utf-8");
			for (const pattern of INTERNAL_PATH_PATTERNS) {
				if (pattern.test(source)) {
					offenders.push(`${file} matches ${pattern}`);
					break;
				}
			}
		}
		expect(offenders).toEqual([]);
	});
});
