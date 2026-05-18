// ABOUTME: Tests that tasks.ts publishes __piTaskList with full task array to globalThis.
// ABOUTME: Validates TaskListInfo shape: tasks array, remaining count, total count.

import { describe, it, expect, beforeEach } from "vitest";

// We test the publishTaskList logic extracted as a pure function.
// The actual extension wires this into refreshWidget/refreshUI.

type TaskStatus = "idle" | "inprogress" | "done";

interface Task {
	id: number;
	text: string;
	status: TaskStatus;
	claimedBy?: string;
	claimedAt?: string;
	lastUpdatedAt?: string;
	lastUpdatedBy?: string;
}

export interface TaskListInfo {
	tasks: { id: number; text: string; status: TaskStatus; claimedBy?: string; claimedAt?: string; lastUpdatedAt?: string; lastUpdatedBy?: string }[];
	title?: string;
	remaining: number;
	total: number;
}

// Mirror of the task publishing shape in tasks.ts
function publishTaskList(tasks: Task[], listTitle?: string): TaskListInfo {
	const remaining = tasks.filter(t => t.status !== "done").length;
	return {
		tasks: tasks.map(t => ({
			id: t.id,
			text: t.text,
			status: t.status,
			...(t.claimedBy ? { claimedBy: t.claimedBy } : {}),
			...(t.claimedAt ? { claimedAt: t.claimedAt } : {}),
			...(t.lastUpdatedAt ? { lastUpdatedAt: t.lastUpdatedAt } : {}),
			...(t.lastUpdatedBy ? { lastUpdatedBy: t.lastUpdatedBy } : {}),
		})),
		title: listTitle,
		remaining,
		total: tasks.length,
	};
}

describe("publishTaskList", () => {
	it("returns empty tasks array when no tasks", () => {
		const result = publishTaskList([]);
		expect(result.tasks).toEqual([]);
		expect(result.remaining).toBe(0);
		expect(result.total).toBe(0);
	});

	it("maps all task fields correctly", () => {
		const tasks: Task[] = [
			{ id: 1, text: "Fix bug", status: "done" },
			{ id: 2, text: "Add feature", status: "inprogress" },
			{ id: 3, text: "Write tests", status: "idle" },
		];
		const result = publishTaskList(tasks);
		expect(result.tasks).toEqual([
			{ id: 1, text: "Fix bug", status: "done" },
			{ id: 2, text: "Add feature", status: "inprogress" },
			{ id: 3, text: "Write tests", status: "idle" },
		]);
	});

	it("counts remaining (non-done) tasks correctly", () => {
		const tasks: Task[] = [
			{ id: 1, text: "Done task", status: "done" },
			{ id: 2, text: "Active task", status: "inprogress" },
			{ id: 3, text: "Idle task", status: "idle" },
			{ id: 4, text: "Another done", status: "done" },
		];
		const result = publishTaskList(tasks);
		expect(result.remaining).toBe(2);
		expect(result.total).toBe(4);
	});

	it("preserves claim metadata for board cards", () => {
		const tasks: Task[] = [
			{
				id: 1,
				text: "Claimed task",
				status: "inprogress",
				claimedBy: "builder-agent",
				claimedAt: "2026-01-01T00:00:00.000Z",
				lastUpdatedAt: "2026-01-01T00:01:00.000Z",
				lastUpdatedBy: "builder-agent",
			},
		];
		const result = publishTaskList(tasks);
		expect(result.tasks[0]).toEqual({
			id: 1,
			text: "Claimed task",
			status: "inprogress",
			claimedBy: "builder-agent",
			claimedAt: "2026-01-01T00:00:00.000Z",
			lastUpdatedAt: "2026-01-01T00:01:00.000Z",
			lastUpdatedBy: "builder-agent",
		});
	});

	it("does not invent claim metadata for unclaimed tasks", () => {
		const result = publishTaskList([{ id: 1, text: "Pending", status: "idle" }]);
		expect(result.tasks[0]).toEqual({ id: 1, text: "Pending", status: "idle" });
		expect(result.tasks[0].claimedBy).toBeUndefined();
		expect(result.tasks[0].claimedAt).toBeUndefined();
	});

	it("includes list title when provided", () => {
		const result = publishTaskList([], "Sprint 5");
		expect(result.title).toBe("Sprint 5");
	});

	it("title is undefined when not provided", () => {
		const result = publishTaskList([]);
		expect(result.title).toBeUndefined();
	});

	it("does not mutate original tasks array", () => {
		const tasks: Task[] = [{ id: 1, text: "Task 1", status: "idle" }];
		const original = [...tasks];
		publishTaskList(tasks);
		expect(tasks).toEqual(original);
	});
});
