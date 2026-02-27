// ABOUTME: Pure logic functions for the scrollable task list widget.
// ABOUTME: Provides scroll logic, height adaptation, and nav state for agent-team compact mode.

// ── Types ────────────────────────────────────────────────────────────

type TaskStatus = "idle" | "inprogress" | "done";

export interface TaskListInfo {
	tasks: { id: number; text: string; status: TaskStatus }[];
	title?: string;
	remaining: number;
	total: number;
}

export interface TaskListState {
	selectedIndex: number;
	scrollOffset: number;
}

export interface HeightMode {
	mode: "two-line" | "one-line";
	visibleCount: number;
}

// ── Constants ────────────────────────────────────────────────────────

export const MAX_VISIBLE_TASKS = 6;
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
	const chrome = 2; // top border + bottom border
	const visible = Math.min(taskCount, MAX_VISIBLE_TASKS);

	const twoLineHeight = visible * 2 + chrome;
	if (twoLineHeight <= availableHeight) {
		return { mode: "two-line", visibleCount: visible };
	}

	const oneLineHeight = visible * 1 + chrome;
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

// ── Rendering ────────────────────────────────────────────────────────
// renderTaskList needs TUI functions, so it accepts them as parameters
// to avoid a hard dependency on @mariozechner/pi-tui.

export interface RenderDeps {
	truncateToWidth: (s: string, w: number, suffix: string) => string;
	fg: (color: string, text: string) => string;
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

	const heightMode = computeHeightMode(tasks.length, availableHeight);
	if (heightMode.visibleCount === 0) return [];

	const { above, below } = scrollIndicators(state.scrollOffset, heightMode.visibleCount, tasks.length);
	const { truncateToWidth: trunc, fg } = deps;
	const lines: string[] = [];

	// ── Header border ──────────────────────────────────────────────
	const headerLabel = heightMode.mode === "two-line"
		? ` Tasks (${taskList.remaining}/${taskList.total} remaining) `
		: ` Tasks (${taskList.remaining}/${taskList.total}) `;
	const aboveSuffix = above ? ` ${above} ` : "";
	const headerLabelLen = headerLabel.length;
	const aboveSuffixLen = aboveSuffix.length;
	const headerDashLen = Math.max(0, width - 3 - headerLabelLen - aboveSuffixLen - 2);
	const headerLine = fg("dim", "\u2500".repeat(3))
		+ fg("accent", headerLabel)
		+ fg("dim", "\u2500".repeat(headerDashLen))
		+ (above ? fg("muted", aboveSuffix) : "")
		+ fg("dim", "\u2500".repeat(Math.min(2, Math.max(0, width - 3 - headerLabelLen - headerDashLen - aboveSuffixLen))));
	lines.push(trunc(headerLine, width, ""));

	// ── Task lines ─────────────────────────────────────────────────
	const visibleTasks = tasks.slice(state.scrollOffset, state.scrollOffset + heightMode.visibleCount);

	for (let i = 0; i < visibleTasks.length; i++) {
		const task = visibleTasks[i];
		const globalIndex = state.scrollOffset + i;
		const isSelected = globalIndex === state.selectedIndex;

		// Status icon
		const iconStr = task.status === "inprogress"
			? fg("accent", STATUS_ICON.inprogress)
			: task.status === "done"
				? fg("success", STATUS_ICON.done)
				: fg("dim", STATUS_ICON.idle);

		// Task text color
		const textColor = task.status === "inprogress" ? "success"
			: task.status === "done" ? "dim"
				: "muted";

		// Selection marker
		const selMark = isSelected
			? (heightMode.mode === "two-line" ? fg("accent", " \u2190selected") : fg("accent", " \u2190sel"))
			: "";
		const selMarkLen = isSelected ? (heightMode.mode === "two-line" ? 10 : 5) : 0;

		// Line 1: icon + #id + text
		const prefix = `  ${iconStr} `;
		const idStr = fg("accent", `#${task.id}`);
		const idLen = `#${task.id}`.length;
		const prefixVisLen = 2 + 1 + 1; // "  " + icon(1) + " "
		const maxTextLen = width - prefixVisLen - idLen - 1 - selMarkLen;
		const taskText = fg(textColor, trunc(task.text, Math.max(0, maxTextLen), "\u2026"));

		lines.push(trunc(prefix + idStr + " " + taskText + selMark, width, ""));

		// Line 2 (only in two-line mode): indented description
		if (heightMode.mode === "two-line") {
			const indent = "      ";
			const maxDescLen = width - indent.length;
			const descLine = indent + fg("dim", trunc(task.text, Math.max(0, maxDescLen), "\u2026"));
			lines.push(trunc(descLine, width, ""));
		}
	}

	// ── Footer border ──────────────────────────────────────────────
	const belowSuffix = below ? ` ${below} ` : "";
	const belowSuffixLen = belowSuffix.length;
	const footerDashLen = Math.max(0, width - belowSuffixLen - 2);
	const footerLine = fg("dim", "\u2500".repeat(footerDashLen))
		+ (below ? fg("muted", belowSuffix) : "")
		+ fg("dim", "\u2500".repeat(Math.min(2, Math.max(0, width - footerDashLen - belowSuffixLen))));
	lines.push(trunc(footerLine, width, ""));

	return lines;
}
