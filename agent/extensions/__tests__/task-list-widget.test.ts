// ABOUTME: Tests for the scrollable task list widget rendering and navigation.
// ABOUTME: Validates scroll logic, height adaptation, keyboard nav, and renderTaskList output.

import { describe, it, expect } from "vitest";
import {
	ensureTaskVisible,
	computeHeightMode,
	scrollIndicators,
	navDown,
	navUp,
	navExit,
	navEnter,
	renderTaskList,
	stripLeadingNumber,
	MAX_VISIBLE_TASKS,
	type TaskListInfo,
	type TaskListState,
	type RenderDeps,
} from "../lib/task-list-render.ts";

// ── Mock render deps (no ANSI, identity functions) ──────────────────

const mockDeps: RenderDeps = {
	truncateToWidth: (s, w, _suffix) => s.length <= w ? s : s.slice(0, w),
	fg: (_color, text) => text,
};

// ── stripLeadingNumber ──────────────────────────────────────────────

describe("stripLeadingNumber", () => {
	it("strips '1. ' prefix", () => {
		expect(stripLeadingNumber("1. Investigate git history")).toBe("Investigate git history");
	});

	it("strips '12. ' prefix", () => {
		expect(stripLeadingNumber("12. Multi-digit task")).toBe("Multi-digit task");
	});

	it("strips '3) ' prefix", () => {
		expect(stripLeadingNumber("3) Parenthesized task")).toBe("Parenthesized task");
	});

	it("does not strip when no number prefix", () => {
		expect(stripLeadingNumber("Investigate git history")).toBe("Investigate git history");
	});

	it("does not strip bare number without separator", () => {
		expect(stripLeadingNumber("42 tasks remaining")).toBe("42 tasks remaining");
	});

	it("handles empty string", () => {
		expect(stripLeadingNumber("")).toBe("");
	});
});

// ── ensureTaskVisible ───────────────────────────────────────────────

describe("ensureTaskVisible (scroll logic)", () => {
	it("keeps offset when selected index is within visible range", () => {
		expect(ensureTaskVisible(3, 0)).toBe(0);
	});

	it("scrolls up when selected is above visible range", () => {
		expect(ensureTaskVisible(1, 3)).toBe(1);
		expect(ensureTaskVisible(0, 5)).toBe(0);
	});

	it("scrolls down when selected is below visible range", () => {
		expect(ensureTaskVisible(8, 0)).toBe(8 - MAX_VISIBLE_TASKS + 1);
		expect(ensureTaskVisible(10, 2)).toBe(10 - MAX_VISIBLE_TASKS + 1);
	});

	it("works at boundaries", () => {
		// Index 5 is within range [0, 6) — stays at offset 0
		expect(ensureTaskVisible(5, 0)).toBe(0);
		// Index 6 is out of [0, 6) — scrolls to 1
		expect(ensureTaskVisible(6, 0)).toBe(1);
	});
});

// ── computeHeightMode ───────────────────────────────────────────────

describe("computeHeightMode", () => {
	it("uses one-line mode when enough height", () => {
		const result = computeHeightMode(3, 10);
		expect(result.mode).toBe("one-line");
		expect(result.visibleCount).toBe(3);
	});

	it("uses one-line mode with all tasks when they fit", () => {
		const result = computeHeightMode(4, 8);
		expect(result.mode).toBe("one-line");
		expect(result.visibleCount).toBe(4);
	});

	it("reduces visible count when one-line doesn't fit either", () => {
		const result = computeHeightMode(6, 5);
		expect(result.mode).toBe("one-line");
		expect(result.visibleCount).toBe(4);
	});

	it("caps at MAX_VISIBLE_TASKS for large lists", () => {
		const result = computeHeightMode(20, 50);
		expect(result.mode).toBe("one-line");
		expect(result.visibleCount).toBe(MAX_VISIBLE_TASKS);
	});

	it("returns at least 1 visible even in tiny terminals", () => {
		const result = computeHeightMode(10, 3);
		expect(result.mode).toBe("one-line");
		expect(result.visibleCount).toBe(2);
	});

	it("handles zero tasks", () => {
		const result = computeHeightMode(0, 20);
		expect(result.mode).toBe("one-line");
		expect(result.visibleCount).toBe(0);
	});
});

// ── scrollIndicators ────────────────────────────────────────────────

describe("scrollIndicators", () => {
	it("shows no indicators when all tasks visible", () => {
		const { above, below } = scrollIndicators(0, 6, 4);
		expect(above).toBe("");
		expect(below).toBe("");
	});

	it("shows below indicator when scrolled to top with overflow", () => {
		const { above, below } = scrollIndicators(0, 6, 10);
		expect(above).toBe("");
		expect(below).toBe("\u25BC4");
	});

	it("shows above indicator when scrolled down", () => {
		const { above, below } = scrollIndicators(3, 6, 10);
		expect(above).toBe("\u25B23");
		expect(below).toBe("\u25BC1");
	});

	it("shows only above when scrolled to bottom", () => {
		const { above, below } = scrollIndicators(4, 6, 10);
		expect(above).toBe("\u25B24");
		expect(below).toBe("");
	});
});

// ── Keyboard nav ────────────────────────────────────────────────────

describe("task list keyboard navigation", () => {
	it("navEnter sets selectedIndex to 0", () => {
		const state = navEnter({ selectedIndex: -1, scrollOffset: 0 }, 5);
		expect(state.selectedIndex).toBe(0);
	});

	it("navEnter does nothing if no tasks", () => {
		const state = navEnter({ selectedIndex: -1, scrollOffset: 0 }, 0);
		expect(state.selectedIndex).toBe(-1);
	});

	it("navDown increments selectedIndex", () => {
		const state = navDown({ selectedIndex: 0, scrollOffset: 0 }, 5);
		expect(state.selectedIndex).toBe(1);
	});

	it("navDown does not go past last task", () => {
		const state = navDown({ selectedIndex: 4, scrollOffset: 0 }, 5);
		expect(state.selectedIndex).toBe(4);
	});

	it("navDown scrolls when hitting bottom edge", () => {
		const state = navDown({ selectedIndex: 5, scrollOffset: 0 }, 10);
		expect(state.selectedIndex).toBe(6);
		expect(state.scrollOffset).toBe(1);
	});

	it("navUp decrements selectedIndex", () => {
		const state = navUp({ selectedIndex: 3, scrollOffset: 0 });
		expect(state.selectedIndex).toBe(2);
	});

	it("navUp does not go below 0", () => {
		const state = navUp({ selectedIndex: 0, scrollOffset: 0 });
		expect(state.selectedIndex).toBe(0);
	});

	it("navUp scrolls when hitting top edge", () => {
		const state = navUp({ selectedIndex: 3, scrollOffset: 3 });
		expect(state.selectedIndex).toBe(2);
		expect(state.scrollOffset).toBe(2);
	});

	it("navExit sets selectedIndex to -1", () => {
		const state = navExit({ selectedIndex: 3, scrollOffset: 2 });
		expect(state.selectedIndex).toBe(-1);
		expect(state.scrollOffset).toBe(2);
	});

	it("full navigation sequence works correctly", () => {
		let state: TaskListState = { selectedIndex: -1, scrollOffset: 0 };

		state = navEnter(state, 8);
		expect(state.selectedIndex).toBe(0);

		for (let i = 0; i < 7; i++) state = navDown(state, 8);
		expect(state.selectedIndex).toBe(7);
		expect(state.scrollOffset).toBe(2);

		state = navDown(state, 8);
		expect(state.selectedIndex).toBe(7);

		for (let i = 0; i < 7; i++) state = navUp(state);
		expect(state.selectedIndex).toBe(0);
		expect(state.scrollOffset).toBe(0);

		state = navExit(state);
		expect(state.selectedIndex).toBe(-1);
	});
});

// ── renderTaskList ──────────────────────────────────────────────────

describe("renderTaskList", () => {
	const makeTasks = (count: number): TaskListInfo => {
		const tasks = Array.from({ length: count }, (_, i) => ({
			id: i + 1,
			text: `Task ${i + 1} description`,
			status: (i === 0 ? "inprogress" : i === 1 ? "done" : "idle") as "idle" | "inprogress" | "done",
		}));
		const remaining = tasks.filter(t => t.status !== "done").length;
		return { tasks, remaining, total: count };
	};

	it("returns empty array for zero tasks", () => {
		const result = renderTaskList(
			{ tasks: [], remaining: 0, total: 0 },
			{ selectedIndex: -1, scrollOffset: 0 },
			80, 20, mockDeps,
		);
		expect(result).toEqual([]);
	});

	it("renders header without borders", () => {
		const result = renderTaskList(makeTasks(3), { selectedIndex: -1, scrollOffset: 0 }, 80, 20, mockDeps);
		expect(result[0]).toContain("Tasks");
		expect(result[0]).not.toContain("\u2500");
	});

	it("shows task ids and text in the output", () => {
		const result = renderTaskList(makeTasks(3), { selectedIndex: -1, scrollOffset: 0 }, 80, 20, mockDeps);
		const joined = result.join("\n");
		expect(joined).toContain(" 1 ");
		expect(joined).toContain(" 2 ");
		expect(joined).toContain(" 3 ");
		expect(joined).toContain("Task 1 description");
	});

	it("strips leading number prefix from task text to avoid duplication with id", () => {
		const info: TaskListInfo = {
			tasks: [
				{ id: 1, text: "1. Investigate git history", status: "idle" },
				{ id: 2, text: "2. Analyze changes", status: "idle" },
			],
			remaining: 2,
			total: 2,
		};
		const result = renderTaskList(info, { selectedIndex: -1, scrollOffset: 0 }, 80, 20, mockDeps);
		const joined = result.join("\n");
		// Should NOT contain "1 1." — the id is shown once and the leading "1." is stripped from text
		expect(joined).not.toMatch(/\b1 1\./);
		expect(joined).toContain("1 Investigate git history");
	});

	it("shows status icons (* for inprogress, x for done, - for idle)", () => {
		const result = renderTaskList(makeTasks(3), { selectedIndex: -1, scrollOffset: 0 }, 80, 20, mockDeps);
		const joined = result.join("\n");
		expect(joined).toContain("*");
		expect(joined).toContain("x");
		expect(joined).toContain("-");
	});

	it("uses one-line mode with enough height", () => {
		const tasks = makeTasks(3);
		const result = renderTaskList(tasks, { selectedIndex: -1, scrollOffset: 0 }, 80, 20, mockDeps);
		// 1 line per task (3 tasks) + 1 chrome (header) = 4 lines
		expect(result.length).toBe(4);
	});

	it("uses one-line mode when height is constrained", () => {
		const tasks = makeTasks(4);
		// 4 tasks * 1 + 1 chrome = 5 lines
		const result = renderTaskList(tasks, { selectedIndex: -1, scrollOffset: 0 }, 80, 8, mockDeps);
		expect(result.length).toBe(5);
	});

	it("shows done/total in header", () => {
		const tasks = makeTasks(5);
		// makeTasks(5): 1 done out of 5 → "1/5"
		const result = renderTaskList(tasks, { selectedIndex: -1, scrollOffset: 0 }, 80, 30, mockDeps);
		expect(result[0]).toContain("1/5");
	});

	it("shows selection marker on selected task", () => {
		const result = renderTaskList(makeTasks(3), { selectedIndex: 1, scrollOffset: 0 }, 80, 20, mockDeps);
		const joined = result.join("\n");
		expect(joined).toContain("\u2190sel");
	});

	it("limits visible tasks to MAX_VISIBLE_TASKS", () => {
		const tasks = makeTasks(10);
		// 6 * 1 + 1 chrome = 7
		const result = renderTaskList(tasks, { selectedIndex: -1, scrollOffset: 0 }, 80, 30, mockDeps);
		expect(result.length).toBe(7);
	});

	it("shows scroll indicators in header when tasks overflow", () => {
		const tasks = makeTasks(10);
		const result = renderTaskList(tasks, { selectedIndex: -1, scrollOffset: 2 }, 80, 30, mockDeps);
		const header = result[0];
		expect(header).toContain("\u25B22");
		expect(header).toContain("\u25BC2");
	});

	it("hides widget when zero tasks", () => {
		const result = renderTaskList(
			{ tasks: [], remaining: 0, total: 0 },
			{ selectedIndex: -1, scrollOffset: 0 },
			80, 20, mockDeps,
		);
		expect(result.length).toBe(0);
	});
});
