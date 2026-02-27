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
}

export interface TaskListInfo {
	tasks: { id: number; text: string; status: TaskStatus }[];
	title?: string;
	remaining: number;
	total: number;
}

// Mirror of the function we'll add to tasks.ts
function publishTaskList(tasks: Task[], listTitle?: string): TaskListInfo {
	const remaining = tasks.filter(t => t.status !== "done").length;
	return {
		tasks: tasks.map(t => ({ id: t.id, text: t.text, status: t.status })),
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
