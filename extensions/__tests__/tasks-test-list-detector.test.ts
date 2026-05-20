// ABOUTME: Tests for the conservative heuristic that flags `tasks new-list`
// ABOUTME: invocations whose brief reads like a validation/test scaffold rather
// ABOUTME: than real shipping work. Soft-warning input only — false positives
// ABOUTME: are tolerated since the consumer only nudges, never blocks.

import { describe, it, expect } from "vitest";
import { looksLikeTestList } from "../lib/tasks-test-list-detector.ts";

describe("looksLikeTestList — strong-signal matches (single occurrence is enough)", () => {
	it("flags 'dummy' anywhere in the text", () => {
		expect(looksLikeTestList("Dummy data list", "We need a few rows for staging.")).toBe(true);
	});

	it("flags 'placeholder' anywhere in the text", () => {
		expect(looksLikeTestList("Placeholder cards for the dashboard demo", undefined)).toBe(true);
	});

	it("flags 'harmless' (the exact phrasing from the 2026-05-19 audit)", () => {
		expect(looksLikeTestList(
			"Audit",
			"Create a harmless auditable parent task to validate the board hierarchy.",
		)).toBe(true);
	});

	it("flags 'smoke test'", () => {
		expect(looksLikeTestList("Smoke test the deploy", "Quick sanity check.")).toBe(true);
	});

	it("flags 'test artifact'", () => {
		expect(looksLikeTestList(undefined, "These are test artifact rows for the integration scaffold.")).toBe(true);
	});

	it("flags 'auditable' (audit-phrasing was the smoking gun in the 2026-05-19 case)", () => {
		expect(looksLikeTestList("Auditable hierarchy scaffold", "Create cards for inspection.")).toBe(true);
	});
});

describe("looksLikeTestList — moderate-signal matches (need 2+ different patterns)", () => {
	it("flags briefs that combine validate + hierarchy", () => {
		expect(looksLikeTestList(
			"Validate parent-child layout",
			"Verify the hierarchy display behaves correctly on the dashboard.",
		)).toBe(true);
	});

	it("flags the exact offending 2026-05-19 brief", () => {
		expect(looksLikeTestList(
			"Commander board hierarchy testing",
			"Validate Commander board parent-child behavior by creating one harmless structured parent task with four subtasks. This tests hierarchy display, schema enforcement, and lifecycle metadata for multi-card board workflows.",
		)).toBe(true);
	});
});

describe("looksLikeTestList — false-positive guards (single moderate keyword is NOT enough)", () => {
	it("does NOT flag 'Test framework refactor' (single 'test' keyword)", () => {
		expect(looksLikeTestList("Test framework refactor", "Migrate vitest config to v2.")).toBe(false);
	});

	it("does NOT flag 'Add validation to signup flow' (single 'validation' keyword)", () => {
		expect(looksLikeTestList(
			"Add validation to signup flow",
			"User-provided emails should be checked for duplicates before account creation.",
		)).toBe(false);
	});

	it("does NOT flag 'Verify login flow' (single 'verify' keyword)", () => {
		expect(looksLikeTestList("Verify login flow", "End-to-end check of the OAuth round-trip.")).toBe(false);
	});

	it("does NOT flag 'Add hierarchy view component' (single 'hierarchy' keyword)", () => {
		expect(looksLikeTestList(
			"Add hierarchy view component",
			"Show parent-child relationships in the task explorer.",
		)).toBe(false);
	});

	it("does NOT flag completely unrelated work", () => {
		expect(looksLikeTestList(
			"Refactor authentication middleware",
			"Replace the legacy session-token storage with the new compliant module.",
		)).toBe(false);
	});
});

describe("looksLikeTestList — edge cases", () => {
	it("handles undefined inputs", () => {
		expect(looksLikeTestList(undefined, undefined)).toBe(false);
	});

	it("handles empty-string inputs", () => {
		expect(looksLikeTestList("", "")).toBe(false);
	});

	it("is case-insensitive", () => {
		expect(looksLikeTestList("DUMMY DATA", undefined)).toBe(true);
		expect(looksLikeTestList(undefined, "HARMLESS validation card")).toBe(true);
	});
});
