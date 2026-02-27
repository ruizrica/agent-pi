// ABOUTME: Pure render functions for vertical timeline pipeline widget
// ABOUTME: Extracts rendering logic from pipeline-team.ts for testability

import { visibleWidth } from "@mariozechner/pi-tui";

// ── Types ────────────────────────────────────────

export type AgentStatus = "idle" | "running" | "done" | "error";
export type PhaseStatus = "pending" | "active" | "done" | "error";

export interface AgentRenderState {
	role: string;
	index: number;
	status: AgentStatus;
	lastWork: string;
	task: string;
	elapsed: number;
}

export interface PhaseRenderState {
	name: string;
	status: PhaseStatus;
	summary: string;
	agents: AgentRenderState[];
}

export interface RenderTheme {
	fg: (color: string, text: string) => string;
	bold: (text: string) => string;
	inverse?: (text: string) => string;
}

// ── Helpers ──────────────────────────────────────

function displayName(name: string): string {
	return name.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

const STATUS_ICONS: Record<AgentStatus | PhaseStatus, string> = {
	idle: "○",
	pending: "○",
	running: "●",
	active: "●",
	done: "✓",
	error: "✗",
};

const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * Generates a status button label with solid background color and bold white text.
 * Shows the agent/phase name inside the pill. For running/active status, includes animated braille spinner.
 */
export function statusButton(
	status: AgentStatus | PhaseStatus,
	label: string,
	theme: RenderTheme,
	showAnimation: boolean = true,
): string {
	const inv = theme.inverse ? (t: string) => theme.inverse!(t) : (t: string) => t;
	
	switch (status) {
		case "running":
		case "active": {
			if (showAnimation) {
				const frame = BRAILLE_FRAMES[Math.floor(Date.now() / 80) % BRAILLE_FRAMES.length];
				return inv(theme.fg("accent", theme.bold(` ${frame} ${label} `)));
			} else {
				return inv(theme.fg("accent", theme.bold(` ${label} `)));
			}
		}
		case "done":
			return inv(theme.fg("success", theme.bold(` ${label} `)));
		case "error":
			return inv(theme.fg("error", theme.bold(` ${label} `)));
		case "idle":
		case "pending":
		default:
			return inv(theme.fg("dim", theme.bold(` ${label} `)));
	}
}

// ── Main Render Function ─────────────────────────

/**
 * Renders a vertical timeline of pipeline phases.
 *
 * Done phases:    ` ✓ NAME  summary text`
 * Active phase:   ` ● NAME  ──────────────`  + agent sub-lines
 * Pending phases: ` ○ NAME`
 */
export function renderVerticalTimeline(
	phases: PhaseRenderState[],
	activeIndex: number,
	width: number,
	theme: RenderTheme,
): string[] {
	const lines: string[] = [];
	const INDENT = " ";        // 1-char left margin
	const ICON_GAP = " ";     // space after icon
	const AGENT_PREFIX = " │  "; // connector + indent for agent lines

	for (let i = 0; i < phases.length; i++) {
		const phase = phases[i];
		const name = phase.name.toUpperCase();
		const statusBtn = statusButton(phase.status, name, theme);

		if (phase.status === "done") {
			// Done: ` [NAME]  summary`
			const prefix = `${INDENT}${statusBtn}`;
			const prefixVisible = INDENT.length + visibleWidth(statusBtn);
			if (phase.summary) {
				const summaryGap = "  ";
				const maxSummary = width - prefixVisible - summaryGap.length;
				const summary = maxSummary > 0 ? truncate(phase.summary, maxSummary) : "";
				const line = prefix + summaryGap + theme.fg("muted", summary);
				lines.push(truncate(line, width));
			} else {
				lines.push(prefix);
			}
		} else if (phase.status === "active") {
			// Active: ` [⠋ NAME]  ─────────────`
			const prefix = `${INDENT}${statusBtn}`;
			const prefixVisible = INDENT.length + visibleWidth(statusBtn);
			const separatorGap = "  ";
			const separatorLen = Math.max(0, width - prefixVisible - separatorGap.length);
			const separator = "─".repeat(separatorLen);
			lines.push(prefix + separatorGap + theme.fg("dim", separator));

			// Agent sub-lines
			for (const agent of phase.agents) {
				const agentName = `${displayName(agent.role)} #${agent.index + 1}`;
				const agentStatusBtn = statusButton(agent.status, agentName, theme);
				const workText = agent.lastWork || agent.task || "—";
				const timeStr = (agent.status === "running" || agent.status === "done" || agent.status === "error") && agent.elapsed > 0
					? `${Math.round(agent.elapsed / 1000)}s`
					: "";

				// ` │  [⠋ Agent #1]  work...  14s`
				const prefixStr = `${AGENT_PREFIX}${agentStatusBtn}`;
				const prefixLen = AGENT_PREFIX.length + visibleWidth(agentStatusBtn);
				const timeLen = timeStr.length;
				const gap = "  ";
				// Available space for work text: width - prefix - gap - time - gap(if time)
				const timeSection = timeLen > 0 ? gap + timeStr : "";
				const timeSectionLen = timeLen > 0 ? gap.length + timeLen : 0;
				const maxWork = width - prefixLen - gap.length - timeSectionLen;
				const work = maxWork > 0 ? truncate(workText, maxWork) : "";
				const workLen = work.length;

				// Right-align time: pad between work and time
				const padLen = Math.max(0, width - prefixLen - gap.length - workLen - timeSectionLen);
				const agentLine = prefixStr + gap + theme.fg("muted", work) + " ".repeat(padLen) + (timeLen > 0 ? theme.fg("dim", timeStr) : "");

				lines.push(truncate(agentLine, width));
			}
		} else {
			// Pending: ` [NAME]`
			const line = `${INDENT}${statusBtn}`;
			lines.push(line);
		}

		// Connector between phases (except after last)
		if (i < phases.length - 1) {
			lines.push(` │`);
		}
	}

	return lines;
}

// ── Collapsed Render Function ────────────────────

/**
 * Renders a single collapsed summary line for the pipeline widget.
 *
 * Active:   ` ● PHASE (N agents)`
 * All done: ` ✓ complete`
 * Empty:    ` ○ no pipeline`
 */
export function renderCollapsedTimeline(
	phases: PhaseRenderState[],
	activeIndex: number,
	pipelineName: string,
	width: number,
	theme: RenderTheme,
): string[] {
	if (phases.length === 0) {
		const idleBtn = statusButton("pending", "no pipeline", theme);
		return [truncate(idleBtn, width)];
	}

	const allDone = phases.every(p => p.status === "done");
	if (allDone) {
		const doneBtn = statusButton("done", "complete", theme);
		return [truncate(doneBtn, width)];
	}

	const active = phases[activeIndex];
	if (!active) {
		const idleBtn = statusButton("pending", "no pipeline", theme);
		return [truncate(idleBtn, width)];
	}

	const agentCount = active.agents.length;
	const agentSuffix = agentCount > 0 ? ` (${agentCount} agents)` : "";
	const activeBtn = statusButton(active.status, active.name.toUpperCase(), theme);
	const line = activeBtn + theme.fg("dim", agentSuffix);
	return [truncate(line, width)];
}

/** Truncate a plain string to max visible chars */
function truncate(s: string, max: number): string {
	if (max <= 0) return "";
	if (s.length <= max) return s;
	return s.slice(0, max - 1) + "…";
}
