// ABOUTME: Pure render logic for the main-session summary view.
// ABOUTME: Produces a terminal-friendly single-page status layout for /summary mode.

export interface SummaryRenderTheme {
	fg: (color: string, text: string) => string;
	bold: (text: string) => string;
}

export interface SummaryToolItem {
	name: string;
	count: number;
}

export interface SessionSummaryState {
	title: string;
	status: string;
	task: string;
	elapsedMs: number;
	toolCount: number;
	latestOutput: string;
	recentTools: SummaryToolItem[];
	activeAgents?: string[];
	emptyState?: string;
}

function compactSentence(text: string, max: number): string {
	const clean = (text || "").replace(/\s+/g, " ").trim();
	if (!clean) return "";
	const trimmed = truncate(clean, max);
	return trimmed.replace(/[;,]\s*$/, "");
}

function uniqueCompactItems(items: string[], maxItems: number, maxChars: number): string[] {
	const out: string[] = [];
	for (const item of items) {
		const compact = compactSentence(item, maxChars);
		if (!compact) continue;
		if (out.includes(compact)) continue;
		out.push(compact);
		if (out.length >= maxItems) break;
	}
	return out;
}

function truncate(text: string, max: number): string {
	if (max <= 0) return "";
	if (text.length <= max) return text;
	if (max <= 3) return text.slice(0, max);
	return text.slice(0, max - 3) + "...";
}

function wrap(text: string, width: number): string[] {
	const clean = (text || "").replace(/\s+/g, " ").trim();
	if (!clean) return [""];
	if (width <= 10) return [truncate(clean, Math.max(1, width))];
	const words = clean.split(" ");
	const lines: string[] = [];
	let current = "";
	for (const word of words) {
		const next = current ? `${current} ${word}` : word;
		if (next.length <= width) {
			current = next;
			continue;
		}
		if (current) lines.push(current);
		current = word.length > width ? truncate(word, width) : word;
	}
	if (current) lines.push(current);
	return lines.length ? lines : [""];
}

function formatElapsed(elapsedMs: number): string {
	const total = Math.max(0, Math.round(elapsedMs / 1000));
	const mins = Math.floor(total / 60);
	const secs = total % 60;
	if (mins > 0) return `${mins}m ${secs}s`;
	return `${secs}s`;
}

function formatTools(tools: SummaryToolItem[]): string {
	if (!tools.length) return "No recent tool activity";
	return tools.map((tool) => `${tool.name} (${tool.count}x)`).join(", ");
}

function statusBadge(theme: SummaryRenderTheme, status: string): string {
	const normalized = (status || "Unknown").toLowerCase();
	const color = normalized.includes("ready")
		? "success"
		: normalized.includes("tool") || normalized.includes("working")
			? "warning"
			: normalized.includes("running")
				? "accent"
				: "dim";
	return theme.fg(color, `[${status || "Unknown"}]`);
}

export function renderSessionSummary(
	state: SessionSummaryState,
	width: number,
	theme: SummaryRenderTheme,
): string[] {
	const contentWidth = Math.max(30, width - 4);
	const divider = "─".repeat(Math.max(12, contentWidth));
	const lines: string[] = [];
	const title = state.title || "Session Summary";
	const statLine = [
		`STATUS ${state.status || "Unknown"}`,
		`ELAPSED ${formatElapsed(state.elapsedMs)}`,
		`TOOLS ${state.toolCount}`,
	].join("   ");
	const hotspot = state.recentTools.length
		? state.recentTools.slice(0, 3).map((tool) => `${tool.name} ${tool.count}x`).join(" · ")
		: "No hotspots";
	const titleLine = compactSentence(title, contentWidth);
	const taskLine = compactSentence(state.task || "No active task", Math.max(48, Math.floor(contentWidth * 1.2)));
	const timelineItems = uniqueCompactItems((state.latestOutput || "").split(" • ").map((entry) => entry.trim()), 3, contentWidth - 4);
	const latestSummary = compactSentence(state.latestOutput || "No recent output", contentWidth * 2);
	const section = (label: string, color: string) => {
		lines.push(theme.fg(color, "▌") + " " + theme.bold(label));
	};

	section("SUMMARY", "accent");
	lines.push(theme.fg("dim", divider));
	lines.push(theme.bold(titleLine));
	lines.push(statusBadge(theme, state.status) + " " + statLine.replace(`STATUS ${state.status || "Unknown"}   `, ""));
	lines.push("");

	if (state.emptyState) {
		lines.push("");
		section("STATE", "warning");
		lines.push(...wrap(state.emptyState, contentWidth));
		return lines;
	}

	lines.push("");
	section("TASK", "success");
	lines.push(...wrap(taskLine, contentWidth));
	lines.push("");

	section("TOOLBOX", "warning");
	lines.push(...wrap(formatTools(state.recentTools), contentWidth));
	lines.push("");

	section("HOTSPOT", "success");
	lines.push(...wrap(hotspot, contentWidth));
	lines.push("");

	if (timelineItems.length > 0) {
		section("LIVE TIMELINE", "accent");
		for (const item of timelineItems) {
			lines.push(...wrap(`• ${item}`, contentWidth));
		}
		lines.push("");
	}

	if (state.activeAgents && state.activeAgents.length > 0) {
		section("AGENTS", "dim");
		lines.push(...wrap(state.activeAgents.join(", "), contentWidth));
		lines.push("");
	}

	section("LATEST SUMMARY", "accent");
	for (const line of wrap(latestSummary, contentWidth)) {
		lines.push(line);
	}

	return lines;
}
