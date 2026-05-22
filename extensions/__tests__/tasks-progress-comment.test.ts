// ABOUTME: Tests for the parent mid-progress comment body built when a child
// ABOUTME: task toggles to done — gives the Commander parent card a real progress
// ABOUTME: signal between create and auto-close.

import { describe, it, expect } from "vitest";
import { buildParentProgressComment, shouldPostParentProgress, shouldReopenParent } from "../tasks.ts";

describe("buildParentProgressComment", () => {
	it("formats progress as M/N complete with the just-finished task text", () => {
		const body = buildParentProgressComment({ done: 1, total: 5, justCompletedText: "Add validation" });
		expect(body).toMatch(/1.*5/);
		expect(body).toContain("Add validation");
	});

	it("uses N/N wording when the final child completes", () => {
		const body = buildParentProgressComment({ done: 5, total: 5, justCompletedText: "Wire up the tests" });
		expect(body).toMatch(/5.*5/);
		expect(body).toContain("Wire up the tests");
	});

	it("trims trailing whitespace from the task text", () => {
		const body = buildParentProgressComment({ done: 2, total: 3, justCompletedText: "  Refactor handler  " });
		expect(body).toContain("Refactor handler");
		expect(body).not.toContain("Refactor handler  ");
	});

	it("strips any leading numeric prefix the agent added (e.g. '1. text')", () => {
		// Pi already strips this for display; we mirror it here so the comment
		// body doesn't read "3/5 complete: 2. Fix bug" (double-numbering).
		const body = buildParentProgressComment({ done: 3, total: 5, justCompletedText: "2. Fix bug" });
		expect(body).toContain("Fix bug");
		expect(body).not.toMatch(/2\. Fix bug/);
	});
});

describe("shouldPostParentProgress", () => {
	it("returns true on a non-done → done transition with a parent groupId", () => {
		expect(shouldPostParentProgress({
			prevStatus: "inprogress",
			nextStatus: "done",
			groupId: 42,
		})).toBe(true);
	});

	it("returns true on idle → done as well (skipping inprogress)", () => {
		expect(shouldPostParentProgress({
			prevStatus: "idle",
			nextStatus: "done",
			groupId: 42,
		})).toBe(true);
	});

	it("returns false on done → idle (un-toggle)", () => {
		expect(shouldPostParentProgress({
			prevStatus: "done",
			nextStatus: "idle",
			groupId: 42,
		})).toBe(false);
	});

	it("returns false when there's no parent groupId yet (group:create still in flight)", () => {
		expect(shouldPostParentProgress({
			prevStatus: "inprogress",
			nextStatus: "done",
			groupId: undefined,
		})).toBe(false);
	});

	it("returns false for any non-→done transition (idle→inprogress, etc.)", () => {
		expect(shouldPostParentProgress({
			prevStatus: "idle",
			nextStatus: "inprogress",
			groupId: 42,
		})).toBe(false);
	});
});

describe("shouldReopenParent — slice #5: undo of mission-complete close", () => {
	it("returns true when a done task moves back to idle and parent was previously closed", () => {
		expect(shouldReopenParent({
			prevStatus: "done",
			nextStatus: "idle",
			groupId: 42,
			parentClosedAt: 1_700_000_000_000,
		})).toBe(true);
	});

	it("returns true when done → inprogress (treated as un-done too)", () => {
		expect(shouldReopenParent({
			prevStatus: "done",
			nextStatus: "inprogress",
			groupId: 42,
			parentClosedAt: 1_700_000_000_000,
		})).toBe(true);
	});

	it("returns false when the parent was never closed (parentClosedAt undefined)", () => {
		expect(shouldReopenParent({
			prevStatus: "done",
			nextStatus: "idle",
			groupId: 42,
			parentClosedAt: undefined,
		})).toBe(false);
	});

	it("returns false when there is no parent groupId yet", () => {
		expect(shouldReopenParent({
			prevStatus: "done",
			nextStatus: "idle",
			groupId: undefined,
			parentClosedAt: 1_700_000_000_000,
		})).toBe(false);
	});

	it("returns false for any non-done → X transition (it's only an un-done that warrants reopen)", () => {
		expect(shouldReopenParent({
			prevStatus: "idle",
			nextStatus: "inprogress",
			groupId: 42,
			parentClosedAt: 1_700_000_000_000,
		})).toBe(false);
	});

	it("returns false when status didn't actually change (done → done is a no-op)", () => {
		expect(shouldReopenParent({
			prevStatus: "done",
			nextStatus: "done",
			groupId: 42,
			parentClosedAt: 1_700_000_000_000,
		})).toBe(false);
	});
});
