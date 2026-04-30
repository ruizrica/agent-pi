// ABOUTME: Footer widget displaying model name, context percentage + window size, and working directory.
// ABOUTME: Shows context usage warnings; core pi framework handles actual auto-compaction.
/**
 * Footer — Dark status bar with model · context % / window · directory.
 *
 * Context compaction is handled by pi's core _runAutoCompaction which properly
 * emits auto_compaction_start/end events. The interactive-mode handles these
 * events by calling rebuildChatFromMessages() to clear and re-render the UI.
 *
 * Previously, this extension called ctx.compact() directly which bypassed
 * the auto_compaction events, leaving stale UI components that caused
 * doubled/artifact rendering after compaction.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { basename, dirname } from "node:path";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { shouldWarnForCompaction, getProactiveCompactionPhase } from "./lib/context-gate.ts";
import { getSessionStats, formatElapsed } from "./lib/session-stats.ts";

/** Turn a model name like "Claude 4 Opus" into "opus 4" */
function shortModelName(name: string | undefined): string {
	if (!name) return "no model";
	const cleaned = name.replace(/^claude\s*/i, "").trim();
	const tokens = cleaned.split(/\s+/);
	const versions: string[] = [];
	const words: string[] = [];
	for (const token of tokens) {
		if (/^[\d.]+$/.test(token)) versions.push(token);
		else words.push(token.toLowerCase());
	}
	const parts = [...words, ...versions];
	return parts.join(" ") || name.toLowerCase();
}

/** Format a token count into compact K/M notation: 200K, 1.2M */
export function formatTokens(n: number): string {
	if (n < 1000) return String(Math.round(n));
	if (n < 1_000_000) {
		const k = n / 1000;
		return k % 1 === 0 ? `${k}K` : `${parseFloat(k.toFixed(1))}K`;
	}
	const m = n / 1_000_000;
	return m % 1 === 0 ? `${m}M` : `${parseFloat(m.toFixed(1))}M`;
}

/** Thinking level → labeled indicator */
function thinkingIndicator(level: string | undefined, theme: any): string {
	const label = level || "off";
	const color = label === "off" ? "dim" : label === "high" || label === "xhigh" ? "warning" : "accent";
	return theme.fg("dim", "thinking: ") + theme.fg(color, theme.bold(label));
}

/** Last two path components: "Github-Work/pi-vs-claude-code" */
function shortDir(cwd: string): string {
	const child = basename(cwd);
	const parent = basename(dirname(cwd));
	return parent ? `${parent}/${child}` : child;
}

function setupFooter(pi: ExtensionAPI, ctx: any, onUnsub: (unsub: () => void) => void) {
	ctx.ui.setFooter((tui: any, theme: any, footerData: any) => {
		const unsub = footerData.onBranchChange(() => tui.requestRender());
		onUnsub(unsub);
		return {
			dispose: unsub,
			invalidate() {},
			render(width: number): string[] {
				const model = shortModelName(ctx.model?.name);
				const usage = ctx.getContextUsage();
				const contextWindow = ctx.model?.contextWindow || 0;

				let usageStr = "–";
				if (usage?.percent != null) {
					const pct = `${Math.round(usage.percent)}%`;
					usageStr = contextWindow > 0 ? `${pct} / ${formatTokens(contextWindow)}` : pct;
				}

				const thinking = thinkingIndicator(pi.getThinkingLevel?.(), theme);
				const sep = theme.fg("dim", " | ");
				const modelStr = theme.fg("accent", theme.bold(model));
				const leftContent = ` ` + modelStr + sep + theme.fg("dim", usageStr);

				const stats = getSessionStats();
				let agentTimeStr = "";
				if (stats) {
					const elapsedMs = Date.now() - stats.startedAt;
					const elapsed = formatElapsed(elapsedMs);
					const timeColor = elapsedMs > 30 * 60_000 ? "warning" : elapsedMs > 5 * 60_000 ? "accent" : "dim";
					agentTimeStr = theme.fg(timeColor, elapsed);
				}
				const rightContent = (agentTimeStr ? agentTimeStr + sep : "") + thinking + ` `;

				const leftWidth = visibleWidth(leftContent);
				const rightWidth = visibleWidth(rightContent);
				const gap = Math.max(1, width - leftWidth - rightWidth);
				const line = leftContent + " ".repeat(gap) + rightContent;
				return [truncateToWidth(line, width, "")];
			},
		};
	});
}

export default function (pi: ExtensionAPI) {
	let branchUnsub: (() => void) | null = null;

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
		setupFooter(pi, ctx, (unsub) => {
			branchUnsub = unsub;
		});
		(globalThis as any).__piRefreshFooter = () => {
			ctx.ui.setFooter(undefined);
			setupFooter(pi, ctx, (unsub) => {
				branchUnsub = unsub;
			});
		};
	});

	// No tool_call blocking — core auto-compaction handles compaction properly
	// via auto_compaction_start/end events which trigger UI rebuild.

	// Footer no longer shows context warnings — memory-cycle.ts handles
	// proactive compaction with two-phase inject (70% prep, 80% hard stop).
	// The footer just renders the percentage in the status bar.

	pi.on("session_shutdown", async () => {
		if (branchUnsub) {
			branchUnsub();
			branchUnsub = null;
		}
		(globalThis as any).__piRefreshFooter = undefined;
	});
}
