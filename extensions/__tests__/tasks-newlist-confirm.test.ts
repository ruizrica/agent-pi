// ABOUTME: Tests for the new-list confirm gate — when to ask user before clearing the task list.
// ABOUTME: Only incomplete lists should require confirmation; finished lists clear silently.

import { describe, it, expect } from "vitest";
import { shouldConfirmNewList } from "../tasks.ts";

describe("shouldConfirmNewList", () => {
	it("returns false when there are no tasks and no title", () => {
		expect(shouldConfirmNewList([], null)).toBe(false);
	});

	it("returns false when all tasks are done", () => {
		const tasks = [
			{ id: 1, text: "task A", status: "done" as const },
			{ id: 2, text: "task B", status: "done" as const },
		];
		expect(shouldConfirmNewList(tasks, "My List")).toBe(false);
	});

	it("returns true when some tasks are idle", () => {
		const tasks = [
			{ id: 1, text: "task A", status: "done" as const },
			{ id: 2, text: "task B", status: "idle" as const },
		];
		expect(shouldConfirmNewList(tasks, "My List")).toBe(true);
	});

	it("returns true when some tasks are inprogress", () => {
		const tasks = [
			{ id: 1, text: "task A", status: "inprogress" as const },
		];
		expect(shouldConfirmNewList(tasks, null)).toBe(true);
	});

	it("returns false when task list is empty even with a title", () => {
		expect(shouldConfirmNewList([], "Old List")).toBe(false);
	});
});

describe("shouldConfirmNewList used by clear action", () => {
	it("returns false for completed list — clear should skip confirmation", () => {
		const tasks = [
			{ id: 1, text: "task A", status: "done" as const },
			{ id: 2, text: "task B", status: "done" as const },
		];
		// clear action should use the same gate as new-list
		expect(shouldConfirmNewList(tasks, "Finished Sprint")).toBe(false);
	});

	it("returns true for incomplete list — clear should still confirm", () => {
		const tasks = [
			{ id: 1, text: "task A", status: "done" as const },
			{ id: 2, text: "task B", status: "idle" as const },
		];
		expect(shouldConfirmNewList(tasks, "Active Sprint")).toBe(true);
	});
});
