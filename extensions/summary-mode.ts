// ABOUTME: Toggleable main-session summary mode shown in place of normal output.
// ABOUTME: Registers /toggle-summary and aggregates task/tool/activity state into a single terminal view.

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { renderSessionSummary, type SessionSummaryState, type SummaryToolItem } from "./lib/summary-render.ts";
import { publishSessionStats, type SessionStats } from "./lib/session-stats.ts";

function setSummaryOnlyMode(active: boolean, ctx?: any) {
	const g = globalThis as any;
	g.__piSummaryModeActive = active;
	if (!ctx?.hasUI) return;
	if (active) {
		ctx.ui.setStatus("commander", undefined);
		ctx.ui.setStatus("tasks", undefined);
		ctx.ui.setStatus("agent-team", undefined);
		ctx.ui.setStatus("agent-chain", undefined);
		ctx.ui.setStatus("pipeline-team", undefined);
		ctx.ui.setStatus("esc-hint", undefined);
	} else {
		const refreshFooter = g.__piRefreshFooter;
		const refreshModeBlock = g.__piRefreshModeBlock;
		if (typeof refreshFooter === "function") refreshFooter();
		if (typeof refreshModeBlock === "function") refreshModeBlock();
	}
}

interface SummaryTimelineItem {
	text: string;
	at: number;
}

interface SummaryModeState {
	active: boolean;
	startedAt: number;
	status: string;
	lastOutput: string;
	toolCounts: Map<string, number>;
	recentAgents: string[];
	recentToolLines: SummaryTimelineItem[];
	recentUserInputs: string[];
	recentFiles: string[];
	overlayOpen: boolean;
}

function getCurrentTaskText(ctx: any): string {
	const shared = (globalThis as any).__piTaskList;
	const tasks = Array.isArray(shared?.tasks) ? shared.tasks : [];
	const active = tasks.find((t: any) => t?.status === "inprogress");
	if (active?.text) return String(active.text);

	try {
		const branch = ctx.sessionManager?.getBranch?.() || [];
		for (let i = branch.length - 1; i >= 0; i--) {
			const entry = branch[i];
			if (entry?.type !== "message") continue;
			const msg = entry.message;
			if (msg?.role === "user") {
				const content = Array.isArray(msg.content)
					? msg.content.map((p: any) => p?.text || "").join(" ")
					: String(msg.content || "");
				const trimmed = content.replace(/\s+/g, " ").trim();
				if (trimmed) return trimmed;
			}
		}
	} catch {}

	return "No active task";
}

function summarizeTools(toolCounts: Map<string, number>): SummaryToolItem[] {
	return [...toolCounts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, 6)
		.map(([name, count]) => ({ name, count }));
}

function buildSummaryState(ctx: any, state: SummaryModeState): SessionSummaryState {
	const task = getCurrentTaskText(ctx);
	const toolItems = summarizeTools(state.toolCounts);
	const toolCount = toolItems.reduce((sum, item) => sum + item.count, 0);
	const latestSummaryParts = [
		state.lastOutput,
		...state.recentToolLines.map((item) => {
			const ageMs = Math.max(0, Date.now() - item.at);
			const secs = Math.floor(ageMs / 1000);
			const ageLabel = secs <= 1 ? "just now" : `${secs}s ago`;
			return `${item.text} (${ageLabel})`;
		}),
		...state.recentFiles.map((file) => `Touched ${file}`),
		...state.recentUserInputs.map((input) => `Asked: ${input}`),
	].filter(Boolean).slice(0, 6);
	return {
		title: "Task at Hand",
		status: state.status,
		task,
		elapsedMs: Date.now() - state.startedAt,
		toolCount,
		latestOutput: latestSummaryParts.join(" • ") || "No recent output",
		recentTools: toolItems,
		activeAgents: state.recentAgents.length ? state.recentAgents : undefined,
		emptyState: !state.lastOutput && toolCount === 0 ? "Waiting for activity" : undefined,
	};
}

export default function (pi: ExtensionAPI) {
	let currentCtx: ExtensionContext | null = null;
	let invalidate: (() => void) | null = null;
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;
	const state: SummaryModeState = {
		active: false,
		startedAt: Date.now(),
		status: "Idle",
		lastOutput: "",
		toolCounts: new Map(),
		recentAgents: [],
		recentToolLines: [],
		recentUserInputs: [],
		recentFiles: [],
		overlayOpen: false,
	};

	/** Publish session stats to globalThis so footer, tasks, and widgets can read them */
	function publishStats() {
		const toolCounts: Record<string, number> = {};
		for (const [name, count] of state.toolCounts) {
			toolCounts[name] = count;
		}
		publishSessionStats({
			startedAt: state.startedAt,
			toolCounts,
			totalToolCalls: [...state.toolCounts.values()].reduce((s, c) => s + c, 0),
			recentFiles: [...state.recentFiles],
			recentAgents: [...state.recentAgents],
			status: state.status,
			updatedAt: Date.now(),
		});
	}

	function refresh() {
		publishStats();
		if (refreshTimer) clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => {
			invalidate?.();
			refreshTimer = null;
		}, 120);
	}

	function hide() {
		if (currentCtx?.hasUI) {
			currentCtx.ui.setWidget("summary-mode", undefined);
		}
		setSummaryOnlyMode(false, currentCtx);
		state.active = false;
		state.overlayOpen = false;
		invalidate = null;
	}

	function show(ctx: ExtensionContext) {
		if (!ctx.hasUI || state.overlayOpen) return;
		currentCtx = ctx;
		state.active = true;
		state.overlayOpen = true;
		setSummaryOnlyMode(true, ctx);
		ctx.ui.setWidget("summary-mode", (_tui: any, theme: any) => {
			const renderFooterHint = () => ["", theme.fg("dim", "ESC=close   /toggle-summary")];
			const box = new Box(1, 1, (text: string) => text);
			const content = new Text("", 0, 0);
			box.addChild(content);
			invalidate = () => box.invalidate();
			return {
				render(width: number): string[] {
					const lines = [...renderSessionSummary(buildSummaryState(ctx, state), width, theme), ...renderFooterHint()];
					content.setText(lines.join("\n"));
					return box.render(width);
				},
				invalidate() {
					box.invalidate();
				},
			};
		}, { placement: "aboveEditor" });
		(globalThis as any).__piCloseSummaryOverlay = () => {
			hide();
		};
	}

	function recordAgent(name: string | undefined) {
		const clean = (name || "main").trim();
		if (!clean) return;
		state.recentAgents = [clean, ...state.recentAgents.filter((n) => n !== clean)].slice(0, 5);
	}

	pi.registerCommand("toggle-summary", {
		description: "Toggle the main-session summary view",
		handler: async (_args, ctx) => {
			currentCtx = ctx;
			if (!ctx.hasUI) return;
			if (state.active) {
				const closeOverlay = (globalThis as any).__piCloseSummaryOverlay;
				if (typeof closeOverlay === "function") closeOverlay();
				else hide();
				ctx.ui.notify("Summary view hidden", "info");
				return;
			}
			ctx.ui.notify("Summary view shown", "info");
			show(ctx);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
		currentCtx = ctx;
		state.startedAt = Date.now();
		state.status = "Idle";
		state.lastOutput = "";
		state.toolCounts.clear();
		state.recentAgents = [];
		state.recentToolLines = [];
		state.recentUserInputs = [];
		state.recentFiles = [];
		state.overlayOpen = false;
		publishStats();
	});

	pi.on("session_switch", async (_event, ctx) => {
		currentCtx = ctx;
	});

	pi.on("input", async (event) => {
		const text = (event.text || "").trim();
		if (text) {
			state.status = "Working";
			state.recentUserInputs = [text, ...state.recentUserInputs.filter((item) => item !== text)].slice(0, 2);
			refresh();
		}
	});

	pi.on("agent_start", async (_event, _ctx) => {
		state.status = "Running";
		recordAgent("main");
		refresh();
	});

	pi.on("agent_end", async (_event, _ctx) => {
		state.status = "Ready";
		refresh();
	});

	pi.on("tool_execution_start", async (event: any) => {
		const name = String(event?.toolName || event?.tool || "tool");
		state.toolCounts.set(name, (state.toolCounts.get(name) || 0) + 1);
		state.recentToolLines = [{ text: `Started ${name}`, at: Date.now() }, ...state.recentToolLines].slice(0, 3);
		state.status = "Using tools";
		refresh();
	});

	pi.on("tool_execution_end", async (event: any) => {
		const name = String(event?.toolName || event?.tool || "tool");
		const filePath = event?.details?.path;
		state.recentToolLines = [
			{ text: `Finished ${name}`, at: Date.now() },
			...state.recentToolLines.filter((item) => item.text !== `Finished ${name}`),
		].slice(0, 3);
		if (filePath) {
			const file = String(filePath).split("/").pop() || String(filePath);
			state.recentFiles = [file, ...state.recentFiles.filter((item) => item !== file)].slice(0, 2);
		}
		state.status = "Running";
		refresh();
	});

	pi.on("message_update", async (event: any) => {
		try {
			const delta = event?.assistantMessageEvent;
			if (delta?.type === "text_delta") {
				const next = `${state.lastOutput}${delta.delta || ""}`;
				const lines = next.split("\n").map((l) => l.trim()).filter(Boolean);
				state.lastOutput = lines.slice(-3).join(" • ") || state.lastOutput;
				refresh();
			}
		} catch {}
	});

	pi.on("message_end", async (event: any) => {
		try {
			const message = event?.message;
			const content = Array.isArray(message?.content)
				? message.content.map((p: any) => p?.text || "").join(" ")
				: "";
			const trimmed = content.replace(/\s+/g, " ").trim();
			if (trimmed) {
				state.lastOutput = trimmed;
				refresh();
			}
		} catch {}
	});

	pi.on("session_shutdown", async () => {
		if (refreshTimer) {
			clearTimeout(refreshTimer);
			refreshTimer = null;
		}
		setSummaryOnlyMode(false, currentCtx);
	});
}
