// ABOUTME: Dream scheduler extension - reminds users to run /dream for context hygiene.
// ABOUTME: Tracks last dream date in .context/dream-state.json and suggests when stale.
/**
 * Dream Scheduler - Gentle reminders for context consolidation
 *
 * On session start, checks .context/dream-state.json to see when the last
 * /dream cycle ran. If it's been longer than the configured interval (default 24h),
 * displays a gentle reminder in the startup banner.
 *
 * Also provides:
 *   /dream-status  - Check when last dream ran and next recommended time
 *   /dream-config  - Configure the reminder interval
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Box, Text } from "@mariozechner/pi-tui";
import * as fs from "node:fs";
import * as path from "node:path";

// ── Types ────────────────────────────────────────────────────────────

interface DreamState {
	lastDream: string | null;
	intervalHours: number;
	enabled: boolean;
	lastSummary?: {
		filesArchived: number;
		filesDeleted: number;
		skillsCreated: number;
		obsidianIngests: number;
	};
}

const DEFAULT_STATE: DreamState = {
	lastDream: null,
	intervalHours: 24,
	enabled: true,
};

// ── Helpers ──────────────────────────────────────────────────────────

function getDreamStatePath(): string {
	return path.join(process.cwd(), ".context", "dream-state.json");
}

function readDreamState(): DreamState {
	const statePath = getDreamStatePath();
	try {
		if (fs.existsSync(statePath)) {
			const content = fs.readFileSync(statePath, "utf-8");
			return { ...DEFAULT_STATE, ...JSON.parse(content) };
		}
	} catch {
		// Ignore parse errors, return default
	}
	return { ...DEFAULT_STATE };
}

function writeDreamState(state: DreamState): void {
	const statePath = getDreamStatePath();
	const contextDir = path.dirname(statePath);

	// Ensure .context directory exists
	if (!fs.existsSync(contextDir)) {
		fs.mkdirSync(contextDir, { recursive: true });
	}

	fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function getHoursSinceLastDream(state: DreamState): number | null {
	if (!state.lastDream) return null;

	const lastDreamDate = new Date(state.lastDream);
	const now = new Date();
	const diffMs = now.getTime() - lastDreamDate.getTime();
	return diffMs / (1000 * 60 * 60);
}

function formatTimeSince(hours: number): string {
	if (hours < 1) {
		const minutes = Math.round(hours * 60);
		return `${minutes} minute${minutes === 1 ? "" : "s"}`;
	}
	if (hours < 24) {
		const h = Math.round(hours);
		return `${h} hour${h === 1 ? "" : "s"}`;
	}
	const days = Math.round(hours / 24);
	return `${days} day${days === 1 ? "" : "s"}`;
}

function formatNextDream(state: DreamState): string {
	if (!state.lastDream) return "No previous dream recorded";

	const hoursSince = getHoursSinceLastDream(state);
	if (hoursSince === null) return "Unknown";

	const hoursUntilNext = state.intervalHours - hoursSince;

	if (hoursUntilNext <= 0) {
		return "Now (overdue)";
	}

	return `In ${formatTimeSince(hoursUntilNext)}`;
}

// ── Dream Status Card Renderer ───────────────────────────────────────

function renderDreamStatusCard(
	message: any,
	_options: any,
	theme: any,
) {
	const state = message.details?.state as DreamState;
	const hoursSince = message.details?.hoursSince as number | null;
	const isStale = message.details?.isStale as boolean;

	const statusColor = isStale ? "warning" : "success";
	const statusIcon = isStale ? "💤" : "✨";

	const lines: string[] = [];

	// Header
	lines.push(theme.fg("muted", `${statusIcon} Dream Status`));
	lines.push("");

	// Last dream
	if (state.lastDream) {
		const lastDate = new Date(state.lastDream);
		lines.push(
			theme.fg("dim", "Last dream: ") +
			theme.fg("muted", lastDate.toLocaleDateString()) +
			theme.fg("dim", " at ") +
			theme.fg("muted", lastDate.toLocaleTimeString())
		);
		lines.push(
			theme.fg("dim", "Time since: ") +
			theme.fg(statusColor as any, formatTimeSince(hoursSince!))
		);
	} else {
		lines.push(theme.fg("dim", "No previous dream recorded"));
	}

	// Interval
	lines.push(
		theme.fg("dim", "Interval: ") +
		theme.fg("muted", `${state.intervalHours} hours`)
	);

	// Next recommended
	lines.push(
		theme.fg("dim", "Next dream: ") +
		theme.fg(statusColor as any, formatNextDream(state))
	);

	// Last summary if available
	if (state.lastSummary) {
		lines.push("");
		lines.push(theme.fg("dim", "Last cycle:"));
		lines.push(
			theme.fg("dim", "  ") +
			theme.fg("muted", `${state.lastSummary.filesArchived} archived, `) +
			theme.fg("muted", `${state.lastSummary.filesDeleted} deleted, `) +
			theme.fg("muted", `${state.lastSummary.skillsCreated} skills`)
		);
	}

	// Suggestion if stale
	if (isStale) {
		lines.push("");
		lines.push(theme.fg("warning", "Consider running /dream to consolidate context"));
	}

	return Box({
		borderStyle: "round",
		borderColor: isStale ? "yellow" : "gray",
		padding: { left: 1, right: 1 },
		children: [Text({ content: lines.join("\n") })],
	});
}

// ── Dream Reminder Banner ────────────────────────────────────────────

function renderDreamReminder(
	message: any,
	_options: any,
	theme: any,
) {
	const hoursSince = message.details?.hoursSince as number;

	const content =
		theme.fg("warning", "💤 ") +
		theme.fg("muted", "Context may be stale - last dream was ") +
		theme.fg("warning", formatTimeSince(hoursSince)) +
		theme.fg("muted", " ago. Run ") +
		theme.fg("info", "/dream") +
		theme.fg("muted", " to consolidate.");

	return Box({
		borderStyle: "single",
		borderColor: "yellow",
		padding: { left: 1, right: 1 },
		children: [Text({ content })],
	});
}

// ── Extension Entry Point ────────────────────────────────────────────

export default function dreamScheduler(pi: ExtensionAPI) {
	// Register custom message renderers
	pi.registerMessageRenderer("dream-status", renderDreamStatusCard);
	pi.registerMessageRenderer("dream-reminder", renderDreamReminder);

	// ── Session Start Hook ───────────────────────────────────────
	// Check if it's been too long since the last dream and show reminder

	pi.on("session_start", () => {
		const state = readDreamState();

		if (!state.enabled) return;

		const hoursSince = getHoursSinceLastDream(state);

		// Only show reminder if we have a previous dream and it's stale
		if (hoursSince !== null && hoursSince > state.intervalHours) {
			// Show gentle reminder after a short delay (let other startup messages appear first)
			setTimeout(() => {
				pi.sendMessage({
					customType: "dream-reminder",
					content: "",
					display: true,
					details: { hoursSince },
				});
			}, 500);
		}
	});

	// ── /dream-status Command ────────────────────────────────────
	// Show current dream state and next recommended time

	pi.registerCommand("dream-status", {
		description: "Check when last /dream ran and next recommended time",
		handler: async () => {
			const state = readDreamState();
			const hoursSince = getHoursSinceLastDream(state);
			const isStale = hoursSince !== null && hoursSince > state.intervalHours;

			pi.sendMessage({
				customType: "dream-status",
				content: "",
				display: true,
				details: { state, hoursSince, isStale },
			});
		},
	});

	// ── /dream-config Command ────────────────────────────────────
	// Configure dream reminder interval

	pi.registerCommand("dream-config", {
		description: "Configure dream reminder interval (hours)",
		handler: async (args: string) => {
			const state = readDreamState();

			const parts = args.trim().split(/\s+/);

			if (parts[0] === "disable") {
				state.enabled = false;
				writeDreamState(state);
				pi.sendMessage({
					customType: "dream-config",
					content: "Dream reminders disabled. Run `/dream-config enable` to re-enable.",
					display: true,
				});
				return;
			}

			if (parts[0] === "enable") {
				state.enabled = true;
				writeDreamState(state);
				pi.sendMessage({
					customType: "dream-config",
					content: "Dream reminders enabled.",
					display: true,
				});
				return;
			}

			const hours = parseInt(parts[0], 10);
			if (isNaN(hours) || hours < 1 || hours > 168) {
				pi.sendMessage({
					customType: "dream-config",
					content: "Usage: `/dream-config <hours>` (1-168) or `/dream-config disable|enable`\n\nCurrent interval: " + state.intervalHours + " hours",
					display: true,
				});
				return;
			}

			state.intervalHours = hours;
			writeDreamState(state);

			pi.sendMessage({
				customType: "dream-config",
				content: `Dream reminder interval set to ${hours} hours.`,
				display: true,
			});
		},
	});

	// ── dream_status Tool ────────────────────────────────────────
	// LLM-callable tool to check dream state

	pi.registerTool({
		name: "dream_status",
		description: "Check the current dream state - when last dream ran, interval, and whether it's stale",
		parameters: Type.Object({}),
		handler: async () => {
			const state = readDreamState();
			const hoursSince = getHoursSinceLastDream(state);
			const isStale = hoursSince !== null && hoursSince > state.intervalHours;

			return {
				lastDream: state.lastDream,
				hoursSinceLastDream: hoursSince ? Math.round(hoursSince * 10) / 10 : null,
				intervalHours: state.intervalHours,
				enabled: state.enabled,
				isStale,
				nextDream: formatNextDream(state),
				lastSummary: state.lastSummary || null,
			};
		},
	});

	// ── dream_record Tool ────────────────────────────────────────
	// Called by dream-cleaner agent to record a completed dream

	pi.registerTool({
		name: "dream_record",
		description: "Record a completed dream cycle (called by dream-cleaner agent)",
		parameters: Type.Object({
			filesArchived: Type.Number({ description: "Number of files archived" }),
			filesDeleted: Type.Number({ description: "Number of files deleted" }),
			skillsCreated: Type.Number({ description: "Number of skills created" }),
			obsidianIngests: Type.Number({ description: "Number of Obsidian ingests" }),
		}),
		handler: async (params: { filesArchived: number; filesDeleted: number; skillsCreated: number; obsidianIngests: number }) => {
			const state = readDreamState();

			state.lastDream = new Date().toISOString();
			state.lastSummary = {
				filesArchived: params.filesArchived,
				filesDeleted: params.filesDeleted,
				skillsCreated: params.skillsCreated,
				obsidianIngests: params.obsidianIngests,
			};

			writeDreamState(state);

			return {
				recorded: true,
				lastDream: state.lastDream,
				nextDream: formatNextDream(state),
			};
		},
	});
}
