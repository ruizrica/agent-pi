// ABOUTME: Pure logic functions for the scrollable task list widget.
// ABOUTME: Provides scroll logic, wrapping, height adaptation, and nav state for active task displays.

// ── Types ────────────────────────────────────────────────────────────

type TaskStatus = "idle" | "inprogress" | "done";

export interface TaskListInfo {
	tasks: { id: number; text: string; status: TaskStatus }[];
	title?: string;
	description?: string;
	remaining: number;
	total: number;
}

export interface TaskListState {
	selectedIndex: number;
	scrollOffset: number;
}

export interface HeightMode {
	mode: "one-line";
	visibleCount: number;
}

// ── Constants ────────────────────────────────────────────────────────

export const MAX_VISIBLE_TASKS = 6;
export const TASK_HOTKEY_HINT = "Ctrl+Alt+T tasks";
export const STATUS_ICON: Record<TaskStatus, string> = { idle: "-", inprogress: "*", done: "x" };

// ── Scroll logic ─────────────────────────────────────────────────────

export function ensureTaskVisible(selectedIndex: number, scrollOffset: number, maxVisible: number = MAX_VISIBLE_TASKS): number {
	if (selectedIndex < scrollOffset) {
		return selectedIndex;
	}
	if (selectedIndex >= scrollOffset + maxVisible) {
		return selectedIndex - maxVisible + 1;
	}
	return scrollOffset;
}

// ── Height adaptation ────────────────────────────────────────────────

export function computeHeightMode(taskCount: number, availableHeight: number): HeightMode {
	const chrome = 1; // header only
	const visible = Math.min(taskCount, MAX_VISIBLE_TASKS);

	const oneLineHeight = visible + chrome;
	if (oneLineHeight <= availableHeight) {
		return { mode: "one-line", visibleCount: visible };
	}

	const maxFit = Math.max(1, availableHeight - chrome);
	return { mode: "one-line", visibleCount: Math.min(visible, maxFit) };
}

// ── Scroll indicators ────────────────────────────────────────────────

export function scrollIndicators(offset: number, visibleCount: number, totalCount: number): { above: string; below: string } {
	const above = offset > 0 ? `\u25B2${offset}` : "";
	const belowCount = Math.max(0, totalCount - offset - visibleCount);
	const below = belowCount > 0 ? `\u25BC${belowCount}` : "";
	return { above, below };
}

// ── Keyboard nav ─────────────────────────────────────────────────────

export function navDown(state: TaskListState, totalTasks: number): TaskListState {
	const maxIndex = totalTasks - 1;
	if (state.selectedIndex >= maxIndex) return state;
	const newIndex = state.selectedIndex + 1;
	const newOffset = ensureTaskVisible(newIndex, state.scrollOffset);
	return { selectedIndex: newIndex, scrollOffset: newOffset };
}

export function navUp(state: TaskListState): TaskListState {
	if (state.selectedIndex <= 0) return state;
	const newIndex = state.selectedIndex - 1;
	const newOffset = ensureTaskVisible(newIndex, state.scrollOffset);
	return { selectedIndex: newIndex, scrollOffset: newOffset };
}

export function navExit(state: TaskListState): TaskListState {
	return { ...state, selectedIndex: -1 };
}

export function navEnter(state: TaskListState, totalTasks: number): TaskListState {
	if (totalTasks === 0) return state;
	return { ...state, selectedIndex: 0 };
}

// ── Text helpers ─────────────────────────────────────────────────────

/** Strip leading number prefix (e.g. "1. " or "3) ") from task text.
 *  The widget already shows the task ID, so this avoids "1 1. Task". */
export function stripLeadingNumber(text: string): string {
	return text.replace(/^\d+[.)]\s+/, "");
}

function wrapWords(text: string, maxWidth: number): string[] {
	const words = text.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return [];
	const lines: string[] = [];
	let current = "";

	for (const word of words) {
		if (current.length === 0) {
			current = word;
		} else if (current.length + 1 + word.length <= maxWidth) {
			current += ` ${word}`;
		} else {
			lines.push(current);
			current = word;
		}

		while (current.length > maxWidth) {
			lines.push(current.slice(0, maxWidth));
			current = current.slice(maxWidth);
		}
	}

	if (current.length > 0) lines.push(current);
	return lines;
}

// ── Rendering ────────────────────────────────────────────────────────
// renderTaskList needs TUI functions, so it accepts them as parameters
// to avoid a hard dependency on @earendil-works/pi-tui.

export interface RenderDeps {
	truncateToWidth: (s: string, w: number, suffix: string) => string;
	fg: (color: string, text: string) => string;
	bold?: (text: string) => string;
}

export function renderTaskList(
	taskList: TaskListInfo,
	_state: TaskListState,
	width: number,
	availableHeight: number,
	deps: RenderDeps,
): string[] {
	const { tasks } = taskList;
	if (tasks.length === 0) return [];

	const { truncateToWidth: trunc, fg } = deps;
	const bold = deps.bold ?? ((text: string) => text);
	const lines: string[] = [];
	const doneCount = taskList.total - taskList.remaining;
	const rawSummaryLines = taskList.description
		? wrapWords(taskList.description, Math.max(20, width - 4))
		: [];
	const maxSummaryLines = Math.max(0, availableHeight - 3); // header + optional blank + hotkey hint
	const summaryLines = rawSummaryLines.slice(0, maxSummaryLines);

	// ── Header ────────────────────────────────────────────────────
	const title = taskList.title || "Tasks";
	const headerLabel = `  ${title} ${doneCount}/${taskList.total}`;
	lines.push(trunc(bold(fg("text", headerLabel)), width, ""));

	if (summaryLines.length > 0) {
		lines.push(`  ${fg("accent", "Mission Brief:")}`);
		for (const line of summaryLines) {
			lines.push(trunc(`    ${fg("muted", line)}`, width, ""));
		}
		lines.push("");
	}

	lines.push(trunc(`  ${fg("dim", `Task details: ${TASK_HOTKEY_HINT} or /tasks`)}`, width, ""));

	return lines;
}
