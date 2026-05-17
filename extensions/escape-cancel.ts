// ABOUTME: Double-tap ESC cancels all running operations (agent stream, subagents, chains, pipelines).
// ABOUTME: Listens for raw terminal ESC input and detects two presses within 400ms.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { matchesKey } from "@earendil-works/pi-tui";
import { applyExtensionDefaults } from "./lib/themeMap.ts";

/** Time window (ms) for two ESC presses to be considered a double-tap. */
const DOUBLE_TAP_WINDOW = 400;

function isPrintMode(): boolean {
	return process.argv.includes("-p") || process.argv.includes("--print");
}

export default function (pi: ExtensionAPI) {
	let lastEscTime = 0;
	let unsub: (() => void) | null = null;
	let isAgentRunning = false;

	function cancelAll(ctx: any) {
		const g = globalThis as any;
		let cancelled = false;

		// 1. Abort the main agent stream
		if (!ctx.isIdle()) {
			ctx.abort();
			cancelled = true;
		}

		// 2. Kill all running subagents (exposed by subagent-widget.ts)
		if (typeof g.__piKillAllSubagents === "function") {
			const killed = g.__piKillAllSubagents();
			if (killed > 0) cancelled = true;
		}

		// 3. Kill running chain process (exposed by agent-chain.ts)
		if (typeof g.__piKillChainProc === "function") {
			if (g.__piKillChainProc()) cancelled = true;
		}

		// 4. Kill running pipeline processes (exposed by pipeline-team.ts)
		if (typeof g.__piKillPipelineProc === "function") {
			if (g.__piKillPipelineProc()) cancelled = true;
		}

		// 5. Kill running team agent processes (exposed by agent-team.ts)
		if (typeof g.__piKillTeamProcs === "function") {
			const killed = g.__piKillTeamProcs();
			if (killed > 0) cancelled = true;
		}

		if (cancelled) {
			ctx.ui.notify("All operations cancelled (ESC ESC)", "warning");
		}
	}

	function teardownInputListener() {
		if (unsub) {
			try {
				unsub();
			} catch {
				// Ignore stale/tearing-down UI contexts during session shutdown.
			}
			unsub = null;
		}
	}

	function setupInputListener(ctx: any) {
		if (unsub) return; // Already listening

		unsub = ctx.ui.onTerminalInput((data: string) => {
			// Only detect bare ESC key
			if (!matchesKey(data, "escape")) return undefined;

			const now = Date.now();
			if (now - lastEscTime < DOUBLE_TAP_WINDOW) {
				// Double-tap detected
				lastEscTime = 0;
				// Only cancel if something is actually running
				if (!ctx.isIdle() || hasRunningOperations()) {
					cancelAll(ctx);
					return { consume: true };
				}
			} else {
				lastEscTime = now;
			}

			// Don't consume — let the normal ESC handler work
			return undefined;
		});
	}

	/** Check if there are running subagents, chains, or pipelines. */
	function hasRunningOperations(): boolean {
		const g = globalThis as any;

		// Check subagents
		if (typeof g.__piHasRunningSubagents === "function" && g.__piHasRunningSubagents()) {
			return true;
		}

		// Check chain
		if (g.__piActiveChain && typeof g.__piHasRunningChain === "function" && g.__piHasRunningChain()) {
			return true;
		}

		// Check pipeline
		if (g.__piActivePipeline && typeof g.__piHasRunningPipeline === "function" && g.__piHasRunningPipeline()) {
			return true;
		}

		// Check team
		if (typeof g.__piHasRunningTeam === "function" && g.__piHasRunningTeam()) {
			return true;
		}

		return false;
	}

	// ── Track agent state for status hint ─────────────────

	pi.on("agent_start", async (_event, ctx) => {
		try {
			isAgentRunning = true;
			if (ctx.hasUI && !isPrintMode()) {
				ctx.ui.setStatus("esc-hint", "\x1b[2m ESC ESC to cancel\x1b[0m");
			}
		} catch {
			// Ignore stale/tearing-down UI contexts.
		}
	});

	pi.on("agent_end", async (_event, ctx) => {
		try {
			isAgentRunning = false;
			if (ctx.hasUI && !isPrintMode()) {
				ctx.ui.setStatus("esc-hint", undefined);
			}
		} catch {
			// Ignore stale/tearing-down UI contexts.
		}
	});

	// ── Session lifecycle ─────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		try {
			if (!isPrintMode()) {
				applyExtensionDefaults(import.meta.url, ctx);
			}
			lastEscTime = 0;
			isAgentRunning = false;
			if (ctx.hasUI && !isPrintMode()) {
				setupInputListener(ctx);
			}
		} catch {
			// Ignore stale/tearing-down UI contexts.
		}
	});

	pi.on("session_switch", async (_event, ctx) => {
		try {
			lastEscTime = 0;
			isAgentRunning = false;
			teardownInputListener();
			if (ctx.hasUI && !isPrintMode()) {
				ctx.ui.setStatus("esc-hint", undefined);
				setupInputListener(ctx);
			}
		} catch {
			// Ignore stale/tearing-down UI contexts.
		}
	});

	pi.on("session_shutdown", async () => {
		try {
			teardownInputListener();
		} catch {
			// Ignore stale/tearing-down UI contexts.
		}
	});
}
