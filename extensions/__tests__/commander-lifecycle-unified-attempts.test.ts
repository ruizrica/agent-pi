// ABOUTME: Phase 2 of Commander lifecycle consolidation — locks in the contract that the
// ABOUTME: cross-session attempt budget is exported from lifecycle-intents.ts and shared by
// ABOUTME: commander-lifecycle-guard.ts (no duplicate `DEFAULT_MAX_INTENT_ATTEMPTS=5` constant)
// ABOUTME: while the in-process retry bound stays small and named distinctly.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Phase 2: unified lifecycle attempt budget naming", () => {
	// Behavioral — verifies the exported constant directly.
	it("MAX_INTENT_ATTEMPTS is exported from lifecycle-intents.ts", async () => {
		const mod = await import("../lib/commander/lifecycle-intents.ts");
		expect(typeof (mod as any).MAX_INTENT_ATTEMPTS).toBe("number");
		expect((mod as any).MAX_INTENT_ATTEMPTS).toBe(5);
	});

	// structural — asserts file wiring (which module owns the constant), not behavior. The shared-budget behavior is observed via reconcileOpenLifecycleIntents (covered in commander-lifecycle-reconciler.test.ts).
	it("commander-lifecycle-guard.ts imports MAX_INTENT_ATTEMPTS instead of declaring its own local constant", () => {
		const source = readFileSync(join(__dirname, "..", "commander-lifecycle-guard.ts"), "utf-8");
		// Must import the shared constant
		expect(source).toMatch(/import\s*\{[^}]*\bMAX_INTENT_ATTEMPTS\b[^}]*\}\s*from\s*["']\.\/lib\/commander\/lifecycle-intents/);
		// Must NOT declare the old hardcoded local constant
		expect(source).not.toContain("const DEFAULT_MAX_INTENT_ATTEMPTS = 5");
	});

	// structural — asserts the rename of an internal constant; the constant is module-local so there is no behavioral surface to test directly.
	it("commander-lifecycle.ts names the in-process retry bound distinctly from the cross-session budget", () => {
		// In-process retries (transient-fault recovery, ~seconds) and cross-session
		// retries (persistent-failure replay, ~sessions) are different axes. The
		// 'MAX_ATTEMPTS' name elided that distinction; rename to IN_PROCESS_RETRY_LIMIT
		// so a reader of the lifecycle code immediately knows which axis they're on.
		const source = readFileSync(join(__dirname, "..", "lib", "commander", "commander-lifecycle.ts"), "utf-8");
		expect(source).toContain("IN_PROCESS_RETRY_LIMIT");
		// Old ambiguous name should be gone
		expect(source).not.toMatch(/^const MAX_ATTEMPTS\s*=\s*2/m);
	});

	// structural — asserts that the in-file documentation cross-reference is present; documentation is not behaviorally observable.
	it("commander-lifecycle.ts documents the relationship between the two retry axes", () => {
		// A future reader should be able to answer "is intent.attempts the same as MAX_ATTEMPTS?"
		// from one in-file comment. The naming alone is insufficient.
		const source = readFileSync(join(__dirname, "..", "lib", "commander", "commander-lifecycle.ts"), "utf-8");
		expect(source).toMatch(/MAX_INTENT_ATTEMPTS/);
	});
});
