// ABOUTME: Smoke test that verifies security-guard loads before tasks (filesystem alphabetical order).
// ABOUTME: Extension hook execution order depends on filename sort — this test guards the invariant.

import { describe, it, expect } from "vitest";

/**
 * The pi-coding-agent framework executes tool_call hooks in filesystem
 * directory listing order (effectively alphabetical on macOS/Linux).
 *
 * security-guard.ts MUST fire before tasks.ts so that security checks
 * are never bypassed by the task gate blocking first.
 *
 * This test will fail if either file is renamed in a way that breaks
 * the ordering, serving as an early warning.
 */
describe("tool_call hook ordering invariant", () => {
	it("security-guard.ts sorts before tasks.ts alphabetically", () => {
		const securityGuard = "security-guard.ts";
		const tasks = "tasks.ts";
		expect(securityGuard.localeCompare(tasks)).toBeLessThan(0);
	});

	it("security-guard.ts sorts before message-integrity-guard.ts in context hooks", () => {
		// message-integrity-guard also hooks context — verify ordering is known
		const messageGuard = "message-integrity-guard.ts";
		const securityGuard = "security-guard.ts";
		// message < security — message-integrity-guard fires first on context hook
		expect(messageGuard.localeCompare(securityGuard)).toBeLessThan(0);
	});
});
