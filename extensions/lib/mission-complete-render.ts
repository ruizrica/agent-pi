// ABOUTME: Pure render logic for the Mission Complete widget.
// ABOUTME: Displays a rich completion summary when all tasks are done — task list, stats, timing.

/**
 * Mission Complete Widget Render
 *
 * Produces terminal-friendly lines for the completion celebration widget.
 * Shown automatically when the last task toggles to done.
 * Persists until the task list is cleared or a new task list is started.
 */

import { formatElapsed, topTools, sessionElapsedMs, type SessionStats } from "./session-stats.ts";

// ── Types ────────────────────────────────────────────────────────────

export interface MissionCompleteTask {
	id: number;
	text: string;
	commanderId?: number;
}

export interface MissionCompleteState {
	/** List title from the task list */
	listTitle: string;
	/** Rich work summary captured when the task list was started */
	summary?: string;
	/** Whether this is a true final completion or an interim handoff */
	variant?: "final" | "interim";
	/** Optional next-step guidance for interim handoffs */
	nextStep?: string;
	/** All completed tasks */
	tasks: MissionCompleteTask[];
	/** Session stats snapshot (may be undefined if summary-mode not loaded) */
	stats?: SessionStats;
	/** Whether all tasks synced to Commander successfully */
	allSynced: boolean;
	/** Number of Commander-mapped tasks */
	syncedCount: number;
	/** Timestamp when mission completed */
	completedAt: number;
}

export interface MissionCompleteTheme {
	fg: (color: string, text: string) => string;
	bold: (text: string) => string;
}

export interface MissionCompleteResult {
	lines: string[];
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

// ── Render ───────────────────────────────────────────────────────────

export function renderMissionComplete(
	state: MissionCompleteState,
	width: number,
	theme: MissionCompleteTheme,
): MissionCompleteResult {
	const lines: string[] = [];
	const contentWidth = Math.max(30, width - 4);

	// ── Header ──────────────────────────────────────────────────
	const title = state.listTitle || "Tasks";
	const variant = state.variant || "final";
	const headerText = variant === "interim" ? "✓ TASK COMPLETE" : "✓ MISSION COMPLETE";
	lines.push(
		theme.bold(theme.fg("success", headerText)) +
		theme.fg("dim", " — ") +
		theme.fg("accent", title),
	);

	if (variant === "interim" && state.nextStep) {
		const wrappedNext = wrapWords(state.nextStep, Math.max(20, contentWidth - 4));
		lines.push(`  ${theme.fg("accent", "UP NEXT:")}`);
		for (const line of wrappedNext) {
			lines.push(`    ${theme.fg("muted", line)}`);
		}
		lines.push("");
	}

	if (state.summary) {
		const label = "Completed Summary:";
		const wrapped = wrapWords(state.summary, Math.max(20, contentWidth - 4));
		if (wrapped.length > 0) {
			lines.push(`  ${theme.fg("accent", label)}`);
			for (const line of wrapped) {
				lines.push(`    ${theme.fg("muted", line)}`);
			}
			lines.push("");
		}
	}

	// ── Completed task list ─────────────────────────────────────
	// Keep completed tasks visible in the mission-complete view so Commander IDs
	// remain available after the completion summary.
	const maxDisplay = Math.min(state.tasks.length, 8);
	const displayTasks = state.tasks.slice(0, maxDisplay);

	for (const task of displayTasks) {
		const check = theme.fg("success", "✓");
		const id = theme.fg("accent", `#${task.id}`);
		const cmdId = task.commanderId
			? theme.fg("dim", ` → CMD #${task.commanderId}`)
			: "";

		const prefixLen = 8 + String(task.id).length + (task.commanderId ? 10 + String(task.commanderId).length : 0);
		const maxTextLen = Math.max(20, contentWidth - prefixLen);
		const wrappedTask = wrapWords(task.text, maxTextLen);
		const taskLines = wrappedTask.length > 0 ? wrappedTask : [task.text];
		lines.push(`  ${check} ${id} ${theme.fg("muted", taskLines[0])}${cmdId}`);
		for (const line of taskLines.slice(1)) {
			lines.push(`      ${theme.fg("muted", line)}`);
		}
	}

	if (state.tasks.length > maxDisplay) {
		lines.push(`  ${theme.fg("dim", `... +${state.tasks.length - maxDisplay} more`)}`);
	}
	if (displayTasks.length > 0) {
		lines.push("");
	}

	// ── Footer stats + tool hotspots ────────────────────────────
	const completionParts: string[] = [
		theme.fg("success", `${state.tasks.length} task${state.tasks.length !== 1 ? "s" : ""} completed`),
	];

	if (state.syncedCount > 0) {
		const syncLabel = state.allSynced
			? theme.fg("success", `${state.syncedCount} synced ✓`)
			: theme.fg("warning", `${state.syncedCount}/${state.tasks.length} synced`);
		completionParts.push(syncLabel);
	}

	lines.push("  " + completionParts.join(theme.fg("dim", " · ")));

	if (state.stats) {
		const elapsed = formatElapsed(sessionElapsedMs(state.stats));
		const activityParts = [theme.fg("dim", `Duration: ${elapsed}`)];

		if (state.stats.totalToolCalls > 0) {
			activityParts.push(theme.fg("dim", `Tool Calls: ${state.stats.totalToolCalls}`));
		}

		lines.push("  " + activityParts.join(theme.fg("dim", " · ")));

		if (state.stats.totalToolCalls > 0) {
			const top = topTools(state.stats, 3);
			if (top.length > 0) {
				const hotspotStr = top.map(t => `${t.name} ${t.count}x`).join(", ");
				lines.push("  " + theme.fg("dim", "Top tools: ") + theme.fg("muted", hotspotStr));
			}
		}
	}

	return { lines };
}

// ── Background colors for the widget box ─────────────────────────────

/** Dark green-tinted background for the completion widget */
export const MISSION_COMPLETE_BG = "\x1b[48;2;20;45;30m";
