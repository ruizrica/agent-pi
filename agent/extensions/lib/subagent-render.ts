// ABOUTME: Pure render logic for subagent widget — title, summary, border count
// ABOUTME: Extracted from subagent-widget.ts for testability

export interface SubRenderState {
	id: number;
	status: "running" | "done" | "error";
	name: string;
	task: string;
	toolCount: number;
	elapsed: number;
	turnCount: number;
	summary?: string;
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

	// Line 1: spinner + title + stats (summary shown on line 2)
	lines.push(
		theme.bold(spinner + title) +
		turnLabel +
		` | (${Math.round(state.elapsed / 1000)}s)` +
		` | Tools: ${state.toolCount}`
	);

	// Line 2: summary (current activity) or task preview as fallback
	const detail = state.summary || state.task;
	const detailPreview = detail.length > 40
		? detail.slice(0, 37) + "..."
		: detail;
	lines.push(`  ${detailPreview}`);

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
