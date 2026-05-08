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
	state: TaskListState,
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
	const reservedTaskLines = Math.min(MAX_VISIBLE_TASKS, tasks.length, Math.max(1, Math.floor(availableHeight / 2)));
	const maxSummaryLines = Math.max(0, availableHeight - 1 - reservedTaskLines - 2); // header + task rows + label/blank
	const summaryLines = rawSummaryLines.slice(0, maxSummaryLines);
	const summaryChrome = summaryLines.length > 0 ? summaryLines.length + 2 : 0; // label + wrapped lines + blank
	const availableTaskLines = Math.max(1, availableHeight - 1 - summaryChrome);
	const visibleCount = Math.min(MAX_VISIBLE_TASKS, tasks.length, availableTaskLines);

	const { above, below } = scrollIndicators(state.scrollOffset, visibleCount, tasks.length);

	// ── Header ────────────────────────────────────────────────────
	const title = taskList.title || "Tasks";
	const headerLabel = `  ${title} ${doneCount}/${taskList.total}`;
	const scrollRight = [above, below].filter(Boolean).join(" ");
	const headerLine = bold(fg("text", headerLabel))
		+ (scrollRight ? " ".repeat(Math.max(1, width - headerLabel.length - scrollRight.length - 2)) + fg("muted", scrollRight) + "  " : "");
	lines.push(trunc(headerLine, width, ""));

	if (summaryLines.length > 0) {
		lines.push(`  ${fg("accent", "Mission Brief:")}`);
		for (const line of summaryLines) {
			lines.push(trunc(`    ${fg("muted", line)}`, width, ""));
		}
		lines.push("");
	}

	// ── Task lines ─────────────────────────────────────────────────
	const visibleTasks = tasks.slice(state.scrollOffset, state.scrollOffset + visibleCount);

	for (let i = 0; i < visibleTasks.length; i++) {
		const task = visibleTasks[i];
		const globalIndex = state.scrollOffset + i;
		const isSelected = globalIndex === state.selectedIndex;

		const iconStr = task.status === "inprogress"
			? fg("accent", STATUS_ICON.inprogress)
			: task.status === "done"
				? fg("success", STATUS_ICON.done)
				: fg("dim", STATUS_ICON.idle);

		const textColor = task.status === "inprogress" ? "success"
			: task.status === "done" ? "dim"
				: "muted";

		const selMark = isSelected ? fg("accent", " \u2190sel") : "";
		const selMarkLen = isSelected ? 5 : 0;
		const idStr = fg("accent", `${task.id}`);
		const idLen = `${task.id}`.length;
		const prefixVisLen = 2 + 1 + 1 + idLen + 1;
		const maxTextLen = Math.max(12, width - prefixVisLen - selMarkLen);
		const displayText = stripLeadingNumber(task.text);
		const wrappedText = wrapWords(displayText, maxTextLen);
		const taskLines = wrappedText.length > 0 ? wrappedText : [displayText];

		lines.push(trunc(`  ${iconStr} ${idStr} ${fg(textColor, taskLines[0])}${selMark}`, width, ""));
		for (const line of taskLines.slice(1)) {
			lines.push(trunc(`      ${fg(textColor, line)}`, width, ""));
		}
	}

	return lines;
}
