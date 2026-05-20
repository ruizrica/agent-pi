// ABOUTME: Tests pure rotation logic for `.commander/claims.json` and `.commander/comments.json` sidecars.
// ABOUTME: Verifies audit trimming preserves invariants (monotonic ids, live state, oldest-discarded).

import { describe, expect, it } from "vitest";
import {
	DEFAULT_LIMITS,
	rotateClaims,
	rotateComments,
	shouldRotate,
	type ClaimsShape,
	type CommentsShape,
} from "../lib/commander/rotate-sidecars.ts";

function makeAuditRow(id: number): { id: number; beadId: string; event: "claim" } {
	return { id, beadId: `b-${id}`, event: "claim" };
}

function makeComment(id: number): { id: number; beadId: string; message: string } {
	return { id, beadId: `b-${id}`, message: `m${id}` };
}

describe("rotateClaims", () => {
	it("returns the same object when audit length is at or below the limit", () => {
		const state: ClaimsShape = {
			nextAuditId: 6,
			byBead: { "task-1": { whatever: true } },
			audit: [makeAuditRow(1), makeAuditRow(2), makeAuditRow(3)],
		};
		const result = rotateClaims(state, { maxAuditRows: 500, maxCommentsPerBead: 100 });
		// Below threshold: pass-through (identity, no allocation cost on hot path).
		expect(result).toBe(state);
	});

	it("trims audit to the last N rows, discarding oldest", () => {
		const audit = Array.from({ length: 1000 }, (_, i) => makeAuditRow(i + 1));
		const state: ClaimsShape = {
			nextAuditId: 1001,
			byBead: { live: { x: 1 } },
			audit,
		};
		const result = rotateClaims(state, { maxAuditRows: 500, maxCommentsPerBead: 100 });
		expect(result.audit.length).toBe(500);
		// Oldest discarded, newest kept.
		expect(result.audit[0]!.id).toBe(501);
		expect(result.audit[result.audit.length - 1]!.id).toBe(1000);
	});

	it("preserves nextAuditId so id allocation stays monotonic after rotation", () => {
		const audit = Array.from({ length: 1000 }, (_, i) => makeAuditRow(i + 1));
		const state: ClaimsShape = {
			nextAuditId: 1001,
			byBead: {},
			audit,
		};
		const result = rotateClaims(state, { maxAuditRows: 500, maxCommentsPerBead: 100 });
		expect(result.nextAuditId).toBe(1001);
	});

	it("preserves byBead (live claim state) byte-identical", () => {
		const live = { "task-1": { identity: { runtime: "claude-code" }, at: "2026-05-19T00:00:00Z" } };
		const audit = Array.from({ length: 1000 }, (_, i) => makeAuditRow(i + 1));
		const state: ClaimsShape = { nextAuditId: 1001, byBead: live, audit };
		const result = rotateClaims(state, { maxAuditRows: 500, maxCommentsPerBead: 100 });
		// Same reference: live claim state is never copied or trimmed.
		expect(result.byBead).toBe(live);
	});

	it("is idempotent on second call", () => {
		const audit = Array.from({ length: 1000 }, (_, i) => makeAuditRow(i + 1));
		const state: ClaimsShape = { nextAuditId: 1001, byBead: {}, audit };
		const once = rotateClaims(state, { maxAuditRows: 500, maxCommentsPerBead: 100 });
		const twice = rotateClaims(once, { maxAuditRows: 500, maxCommentsPerBead: 100 });
		expect(twice).toBe(once);
		expect(twice.audit.length).toBe(500);
	});
});

describe("rotateComments", () => {
	it("returns the same object when no bead exceeds the per-bead cap", () => {
		const state: CommentsShape = {
			nextId: 4,
			byBead: { "b-1": [makeComment(1), makeComment(2), makeComment(3)] },
		};
		const result = rotateComments(state, { maxAuditRows: 500, maxCommentsPerBead: 100 });
		expect(result).toBe(state);
	});

	it("trims each over-cap bead independently, leaves smaller beads untouched", () => {
		const big = Array.from({ length: 200 }, (_, i) => makeComment(i + 1));
		const small = [makeComment(900), makeComment(901)];
		const state: CommentsShape = {
			nextId: 1000,
			byBead: { "b-big": big, "b-small": small },
		};
		const result = rotateComments(state, { maxAuditRows: 500, maxCommentsPerBead: 100 });
		expect(result.byBead["b-big"]!.length).toBe(100);
		expect(result.byBead["b-big"]![0]!.id).toBe(101);
		// Small bead reference is unchanged.
		expect(result.byBead["b-small"]).toBe(small);
	});

	it("preserves nextId so comment ids stay monotonic", () => {
		const big = Array.from({ length: 200 }, (_, i) => makeComment(i + 1));
		const state: CommentsShape = { nextId: 9999, byBead: { "b-big": big } };
		const result = rotateComments(state, { maxAuditRows: 500, maxCommentsPerBead: 100 });
		expect(result.nextId).toBe(9999);
	});
});

describe("shouldRotate", () => {
	it("returns false below the threshold", () => {
		expect(shouldRotate(1_000_000, 5_242_880)).toBe(false);
	});
	it("returns true at or above the threshold", () => {
		expect(shouldRotate(5_242_880, 5_242_880)).toBe(true);
		expect(shouldRotate(10_000_000, 5_242_880)).toBe(true);
	});
});

describe("DEFAULT_LIMITS", () => {
	it("retains enough audit history for typical multi-day forensics", () => {
		// Sanity guard: defaults shouldn't silently shrink below what feels safe.
		expect(DEFAULT_LIMITS.maxAuditRows).toBeGreaterThanOrEqual(500);
		expect(DEFAULT_LIMITS.maxCommentsPerBead).toBeGreaterThanOrEqual(100);
	});
});
