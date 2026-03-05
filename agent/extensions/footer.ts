// ABOUTME: Footer widget displaying model name, context percentage, and working directory.
// ABOUTME: Shows context usage warnings; core pi framework handles actual auto-compaction.
/**
 * Footer — Dark status bar with model · context % · directory.
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

// ── Scout pill constants ─────────────────────────────────────────────────────

const BRAILLE_FRAMES = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];

const SCOUT_BG: Record<string, string> = {
	running: "\x1b[48;2;26;58;92m",   // dark steel blue
	done:    "\x1b[48;2;35;50;55m",    // dark teal-gray
	error:   "\x1b[48;2;70;35;35m",    // dark muted red
};
const WHITE_BOLD = "\x1b[1;97m";
const RESET_ALL = "\x1b[0m";

/** Shorten a model string like "x-ai/grok-4.1-fast" → "grok-4.1-fast" */
function shortScoutModel(model: string): string {
	const slash = model.lastIndexOf("/");
	return slash >= 0 ? model.slice(slash + 1) : model;
}

/** Render the scout pill: colored bg + spinner/icon + SCOUT + model */
function renderScoutPill(status: { status: string; model: string }): string {
	const bg = SCOUT_BG[status.status] || SCOUT_BG.done;
	const spinner = status.status === "running"
		? BRAILLE_FRAMES[Math.floor(Date.now() / 80) % BRAILLE_FRAMES.length]
		: status.status === "done" ? "\u2713"    // ✓
		: "\u2717";                               // ✗
	const model = status.model ? ` ${shortScoutModel(status.model)}` : "";
	return `${bg}${WHITE_BOLD} ${spinner} SCOUT${model} ${RESET_ALL}`;
}

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

/** Last two path components: "Github-Work/pi-vs-claude-code" */
function shortDir(cwd: string): string {
	const child = basename(cwd);
	const parent = basename(dirname(cwd));
	return parent ? `${parent}/${child}` : child;
}

function setupFooter(ctx: any, onUnsub: (unsub: () => void) => void) {
	ctx.ui.setFooter((tui: any, theme: any, footerData: any) => {
		const unsub = footerData.onBranchChange(() => tui.requestRender());
		onUnsub(unsub);
		return {
			dispose: unsub,
			invalidate() {},
			render(width: number): string[] {
				const model = shortModelName(ctx.model?.name);
				const usage = ctx.getContextUsage();
				const pct = usage?.percent != null ? `${Math.round(usage.percent)}%` : "–";
				const dir = shortDir(ctx.cwd);
				const sep = theme.fg("dim", " | ");
				const modelStr = theme.fg("accent", theme.bold(model));
				const leftContent = ` ` + modelStr + sep + theme.fg("dim", pct) + sep + theme.fg("dim", dir);

				// Scout pill — right-aligned when scout is pre-spawned
				const g = globalThis as any;
				const scoutStatus = g.__piScoutId != null ? g.__piScoutStatus : undefined;
				if (scoutStatus) {
					const pill = renderScoutPill(scoutStatus);
					const leftW = visibleWidth(leftContent);
					const pillW = visibleWidth(pill);
					const gap = Math.max(1, width - leftW - pillW);
					return [leftContent + " ".repeat(gap) + pill];
				}

				return [truncateToWidth(leftContent, width, "")];
			},
		};
	});
}

export default function (pi: ExtensionAPI) {
	let branchUnsub: (() => void) | null = null;

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
		setupFooter(ctx, (unsub) => {
			branchUnsub = unsub;
		});
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
	});
}
