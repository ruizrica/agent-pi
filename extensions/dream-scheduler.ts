// ABOUTME: Global-first dream scheduler for Pi's memory consolidation system.
// ABOUTME: Tracks dream freshness in ~/.pi/dream/dream-state.json and reminds users when global memory is stale.

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Box, Text } from "@mariozechner/pi-tui";
import {
	DEFAULT_DREAM_STATE,
	formatNextDream,
	formatTimeSince,
	getHoursSinceLastDream,
	getDreamRoot,
	readDreamState,
	writeDreamState,
} from "./lib/dream-state.js";

function renderDreamStatusCard(message: any, _options: any, theme: any) {
	const state = message.details?.state ?? DEFAULT_DREAM_STATE;
	const hoursSince = message.details?.hoursSince as number | null;
	const isStale = message.details?.isStale as boolean;
	const lines: string[] = [];

	lines.push(theme.fg("muted", "💤 Global Dream Status"));
	lines.push("");
	lines.push(theme.fg("dim", "Mode: ") + theme.fg("muted", state.lastScope || "global"));
	lines.push(theme.fg("dim", "Root: ") + theme.fg("muted", state.globalRoot || getDreamRoot()));

	if (state.lastDream) {
		const lastDate = new Date(state.lastDream);
		lines.push(
			theme.fg("dim", "Last dream: ") +
			theme.fg("muted", lastDate.toLocaleDateString()) +
			theme.fg("dim", " at ") +
			theme.fg("muted", lastDate.toLocaleTimeString()),
		);
		if (hoursSince !== null) {
			lines.push(theme.fg("dim", "Time since: ") + theme.fg(isStale ? "warning" : "success", formatTimeSince(hoursSince)));
		}
	} else {
		lines.push(theme.fg("dim", "No previous global dream recorded"));
	}

	lines.push(theme.fg("dim", "Interval: ") + theme.fg("muted", `${state.intervalHours} hours`));
	lines.push(theme.fg("dim", "Next dream: ") + theme.fg(isStale ? "warning" : "success", formatNextDream(state)));

	if (state.lastSummary) {
		lines.push("");
		lines.push(theme.fg("dim", "Last summary:"));
		lines.push(
			theme.fg("dim", "  ") +
			theme.fg("muted", `${state.lastSummary.workspacesScanned} workspaces, `) +
			theme.fg("muted", `${state.lastSummary.sourcesConsolidated} consolidated, `) +
			theme.fg("muted", `${state.lastSummary.durableMemoriesPromoted} promoted`),
		);
	}

	if (isStale) {
		lines.push("");
		lines.push(theme.fg("warning", "Global Pi memory is stale — run /dream to consolidate and improve Pi."));
	}

	return Box({
		borderStyle: "round",
		borderColor: isStale ? "yellow" : "gray",
		padding: { left: 1, right: 1 },
		children: [Text({ content: lines.join("\n") })],
	});
}

function renderDreamReminder(message: any, _options: any, theme: any) {
	const hoursSince = message.details?.hoursSince as number;
	const content =
		theme.fg("warning", "💤 ") +
		theme.fg("muted", "Global Pi memory may be stale — last dream was ") +
		theme.fg("warning", formatTimeSince(hoursSince)) +
		theme.fg("muted", " ago. Run ") +
		theme.fg("info", "/dream") +
		theme.fg("muted", " to consolidate and improve Pi.");

	return Box({
		borderStyle: "single",
		borderColor: "yellow",
		padding: { left: 1, right: 1 },
		children: [Text({ content })],
	});
}

export default function dreamScheduler(pi: ExtensionAPI) {
	pi.registerMessageRenderer("dream-status", renderDreamStatusCard);
	pi.registerMessageRenderer("dream-reminder", renderDreamReminder);

	pi.on("session_start", () => {
		const state = readDreamState();
		if (!state.enabled) return;
		const hoursSince = getHoursSinceLastDream(state);
		if (hoursSince !== null && hoursSince > state.intervalHours) {
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

	pi.registerCommand("dream-status", {
		description: "Check global dream freshness and next recommended run",
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

	pi.registerCommand("dream-config", {
		description: "Configure global dream reminder interval (hours)",
		handler: async (args: string) => {
			const state = readDreamState();
			const parts = args.trim().split(/\s+/);

			if (parts[0] === "disable") {
				state.enabled = false;
				writeDreamState(state);
				pi.sendMessage({ customType: "dream-config", content: "Global dream reminders disabled.", display: true });
				return;
			}
			if (parts[0] === "enable") {
				state.enabled = true;
				writeDreamState(state);
				pi.sendMessage({ customType: "dream-config", content: "Global dream reminders enabled.", display: true });
				return;
			}

			const hours = parseInt(parts[0], 10);
			if (isNaN(hours) || hours < 1 || hours > 168) {
				pi.sendMessage({
					customType: "dream-config",
					content: `Usage: /dream-config <hours> (1-168) or /dream-config disable|enable\n\nCurrent interval: ${state.intervalHours} hours`,
					display: true,
				});
				return;
			}

			state.intervalHours = hours;
			writeDreamState(state);
			pi.sendMessage({ customType: "dream-config", content: `Global dream reminder interval set to ${hours} hours.`, display: true });
		},
	});

	pi.registerTool({
		name: "dream_status",
		description: "Check global Pi dream state and freshness",
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
				globalRoot: state.globalRoot,
				lastScope: state.lastScope,
				isStale,
				nextDream: formatNextDream(state),
				lastSummary: state.lastSummary || null,
			};
		},
	});

	pi.registerTool({
		name: "dream_record",
		description: "Record a completed global-first dream cycle",
		parameters: Type.Object({
			workspacesScanned: Type.Number(),
			sourcesConsolidated: Type.Number(),
			durableMemoriesPromoted: Type.Number(),
			supersededItems: Type.Number(),
			recommendationsGenerated: Type.Number(),
			scope: Type.Optional(Type.String()),
		}),
		handler: async (params: {
			workspacesScanned: number;
			sourcesConsolidated: number;
			durableMemoriesPromoted: number;
			supersededItems: number;
			recommendationsGenerated: number;
			scope?: string;
		}) => {
			const state = readDreamState();
			state.lastDream = new Date().toISOString();
			state.lastScope = params.scope === "workspace" ? "workspace" : "global";
			state.lastSummary = {
				workspacesScanned: params.workspacesScanned,
				sourcesConsolidated: params.sourcesConsolidated,
				durableMemoriesPromoted: params.durableMemoriesPromoted,
				supersededItems: params.supersededItems,
				recommendationsGenerated: params.recommendationsGenerated,
			};
			writeDreamState(state);
			return {
				recorded: true,
				lastDream: state.lastDream,
				nextDream: formatNextDream(state),
				globalRoot: state.globalRoot,
			};
		},
	});
}
