// ABOUTME: Tests for the new-list mission brief validator — gates list creation
// ABOUTME: on the brief actually being a real 1-3 sentence explanation, per CLAUDE.md.

import { describe, it, expect } from "vitest";
import { validateNewListBrief } from "../lib/tasks-brief-validator.ts";

describe("validateNewListBrief — slice #1: presence + minimum length", () => {
	it("rejects undefined description", () => {
		const result = validateNewListBrief(undefined);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toMatch(/description|brief|required/i);
		}
	});

	it("rejects empty-string description", () => {
		const result = validateNewListBrief("");
		expect(result.ok).toBe(false);
	});

	it("rejects whitespace-only description", () => {
		const result = validateNewListBrief("   \n  \t  ");
		expect(result.ok).toBe(false);
	});

	it("rejects descriptions shorter than 30 characters", () => {
		const result = validateNewListBrief("too short");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toMatch(/30|short|length/i);
		}
	});

	it("accepts descriptions of 30+ characters", () => {
		const brief = "Harden the signup flow by adding duplicate-email checks.";
		const result = validateNewListBrief(brief);
		expect(result.ok).toBe(true);
	});

	it("trims leading/trailing whitespace before measuring length", () => {
		const padded = "   " + "a".repeat(30) + "   ";
		const result = validateNewListBrief(padded);
		expect(result.ok).toBe(true);
	});

	it("error message references the agent contract so the agent knows how to fix it", () => {
		const result = validateNewListBrief(undefined);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toMatch(/what.*why|mission brief|1-3 sentence/i);
		}
	});
});
