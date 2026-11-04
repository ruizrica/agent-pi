// ABOUTME: Pure render logic for subagent widget — title, summary, border count
// ABOUTME: Extracted from subagent-widget.ts for testability

import { truncateToWidth } from "@earendil-works/pi-tui";
import { hideToolkitWidgetMetadata } from "./toolkit-cli.ts";

export interface SubRenderState {
	id: number;
	status: "running" | "done" | "error";
	name: string;
	task: string;
	toolCount: number;
	elapsed: number;
	turnCount: number;
	summary?: string;
	model?: string;
	failureDetail?: string;
	lifecycleEvents?: string[];
	lifecycleLogPath?: string;
	maxDurationMs?: number; // watchdog timeout for progress warning
}

export interface SubRenderTheme {
	fg: (color: string, text: string) => string;
	bold: (text: string) => string;
}

export interface SubRenderResult {
	lines: string[];
	borderCount: number;
}

const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * Build the title label: "NAME - SA{id}"
 */
export function subagentTitle(state: SubRenderState): string {
	return state.name.toUpperCase() + " - SA" + state.id;
}

/**
 * Render the content lines for a subagent widget.
 * Designed for display on a full-width colored background box.
 * Text uses bold white for title and light colors for details.
 * borderCount is always 1 (top divider only).
 */
export function renderSubagentWidget(
	state: SubRenderState,
	width: number,
	theme: SubRenderTheme,
): SubRenderResult {
	const lines: string[] = [];

	const title = subagentTitle(state);

	// Animated spinner for running state
	const spinner = state.status === "running"
		? BRAILLE_FRAMES[Math.floor(Date.now() / 80) % BRAILLE_FRAMES.length] + " "
		: state.status === "done" ? "✓ "
		: "✗ ";

	const turnLabel = state.turnCount > 1
		? ` · Turn ${state.turnCount}`
		: "";

	const hideMetadata = hideToolkitWidgetMetadata(state.name);
	const metadataParts: string[] = [];
	if (!hideMetadata && state.toolCount > 0) {
		metadataParts.push(`Tools: ${state.toolCount}`);
	}
	if (!hideMetadata && state.model) {
		metadataParts.push(state.model);
	}

	// Timeout warning label when approaching watchdog limit
	let timeoutLabel = "";
	if (state.status === "running" && state.maxDurationMs && state.maxDurationMs > 0) {
		const pct = state.elapsed / state.maxDurationMs;
		if (pct >= 0.95) {
			timeoutLabel = " | TIMING OUT";
		} else if (pct >= 0.80) {
			timeoutLabel = " | " + Math.round((state.maxDurationMs - state.elapsed) / 1000) + "s left";
		}
	}

	const metadataSuffix = metadataParts.length > 0 ? ` | ${metadataParts.join(" | ")}` : "";

	// Line 1: spinner + title + stats + optional metadata (summary shown on line 2)
	lines.push(
		theme.bold(spinner + title) +
		turnLabel +
		` | (${Math.round(state.elapsed / 1000)}s)` +
		metadataSuffix +
		timeoutLabel
	);

	// Line 2: summary (current activity) or task preview as fallback.
	// Use the available widget width instead of a fixed character cap so the
	// preview fills the horizontal space and only truncates when it genuinely
	// overflows. Account for the box's 1-col padding each side plus the 2-space
	// indent on this line.
	const detail = state.summary || state.task;
	const detailMaxWidth = Math.max(10, width - 4);
	const detailPreview = truncateToWidth(detail, detailMaxWidth, "...");
	lines.push(`  ${detailPreview}`);

	if (state.status === "error") {
		if (state.failureDetail) {
			const failure = state.failureDetail.length > 96
				? state.failureDetail.slice(0, 93) + "..."
				: state.failureDetail;
			lines.push(`  Error: ${failure}`);
		}
		const lastEvent = state.lifecycleEvents?.[state.lifecycleEvents.length - 1];
		if (lastEvent) {
			const event = lastEvent.length > 96 ? lastEvent.slice(0, 93) + "..." : lastEvent;
			lines.push(`  Last: ${event}`);
		}
		if (state.lifecycleLogPath) {
			lines.push(`  Log: ${state.lifecycleLogPath}`);
		}
	}

	return { lines, borderCount: 1 };
}

/**
 * Parse "/sub SCOUT review the deps" → { name: "SCOUT", task: "review the deps" }.
 * If the first word isn't ALL-CAPS, name defaults to "AGENT".
 */
export function parseSubName(input: string): { name: string; task: string } {
	const trimmed = input.trim();
	if (!trimmed) return { name: "AGENT", task: "" };

	const spaceIdx = trimmed.indexOf(" ");
	const firstWord = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
	const rest = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();

	if (/^[A-Z]{2,}$/.test(firstWord)) {
		return { name: firstWord, task: rest };
	}
	return { name: "AGENT", task: trimmed };
}
