// ABOUTME: Footer widget displaying model name, context percentage, and working directory.
// ABOUTME: Auto-compaction helper with elegant status box and connection metadata.
/**
 * Footer — Dark status bar with model · context % · directory.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";
import { basename, dirname } from "node:path";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { shouldBlockForCompaction, COMPACT_THRESHOLD } from "./lib/context-gate.ts";

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

interface CompactState {
	status: "idle" | "requested" | "done" | "failed";
	startPercent: number;
	startTime: number;
	lastNoticeAt: number;
}

let compactState: CompactState = {
	status: "idle",
	startPercent: 0,
	startTime: 0,
	lastNoticeAt: 0,
};

const AUTO_COMPACT_COOLDOWN_MS = 10_000;
const REQUEST_TTL_MS = 90_000;
const RECOVERY_TARGET_PERCENT = COMPACT_THRESHOLD - 1;
const AUTO_COMPACT_COMMANDS = ["/compact-min", "/compact"] as const;

function padRight(value: string, width: number): string {
	return value.length >= width ? value.slice(0, width) : `${value}${" ".repeat(width - value.length)}`;
}

function compactBox(title: string, lines: string[]): string {
	const width = Math.max(56, Math.min(96, Math.max(title.length, ...lines.map((l) => l.length)) + 6));
	const top = `┌${"─".repeat(width - 2)}┐`;
	const header = `│ ${padRight(title, width - 3)}│`;
	const body = lines.map((line) => `│ ${padRight(line, width - 3)}│`);
	const bottom = `└${"─".repeat(width - 2)}┘`;
	return [top, header, ...body, bottom].join("\n");
}

function connectionInfo(ctx: ExtensionContext, percent?: number): string[] {
	const model = ctx.model;
	return [
		`Model: ${shortModelName(model?.name)} (${model?.provider ?? "local"})`,
		`Context: ${percent != null ? `${Math.round(percent)}%` : "n/a"}`,
		`Workspace: ${shortDir(ctx.cwd)}`,
		`Connection: ${model?.id ? `${model.provider ?? "default"}/${model.id}` : "pi session"}`,
	];
}

function requestAutoCompact(ctx: ExtensionContext, pi: ExtensionAPI): void {
	if (process.env.PI_SUBAGENT === "1") return;
	if (compactState.status === "requested") return;
	const usage = ctx.getContextUsage();
	if (!usage?.percent) return;
	const now = Date.now();
	if (now - compactState.lastNoticeAt < AUTO_COMPACT_COOLDOWN_MS) return;

	compactState = {
		status: "requested",
		startPercent: Math.round(usage.percent),
		startTime: now,
		lastNoticeAt: now,
	};

	ctx.ui.notify(
		compactBox("Auto-Compaction Started", [
			`Usage at ${Math.round(usage.percent)}% reached block threshold.`,
			`Launching compact flow before context-sensitive work resumes.`,
			...connectionInfo(ctx, usage.percent),
		]),
		"warning",
	);

	void (async () => {
		for (const cmd of AUTO_COMPACT_COMMANDS) {
			try {
				await pi.sendMessage(
					{ content: cmd, display: true },
					{ deliverAs: "user", triggerTurn: true },
				);
				return;
			} catch {
				// Try fallback command.
			}
		}

		compactState.status = "failed";
		compactState.lastNoticeAt = Date.now();
		ctx.ui.notify(
			compactBox("Auto-Compaction", [
				"Auto-compaction command unavailable.",
				"Please run /compact manually to continue.",
				...connectionInfo(ctx, usage.percent),
			]),
			"error",
		);
	})();
}

function finalizeCompactStatus(ctx: ExtensionContext): void {
	if (compactState.status !== "requested") return;
	const usage = ctx.getContextUsage();
	if (!usage?.percent) return;

	const percent = Math.round(usage.percent);
	const now = Date.now();
	if (percent <= RECOVERY_TARGET_PERCENT) {
		compactState.status = "done";
		ctx.ui.notify(
			compactBox("Auto-Compaction Complete", [
				`Recovered context usage to ${percent}%.`,
				"Normal workflow resumed.",
				...connectionInfo(ctx, percent),
			]),
			"success",
		);
		compactState.lastNoticeAt = now;
		return;
	}

	if (now - compactState.startTime >= REQUEST_TTL_MS) {
		compactState.status = "failed";
		compactState.lastNoticeAt = now;
		ctx.ui.notify(
			compactBox("Auto-Compaction Caution", [
				"Context remains high and compaction did not settle in time.",
				"Please continue with /compact if needed.",
				...connectionInfo(ctx, percent),
			]),
			"error",
		);
	}
}

function setupFooter(ctx: ExtensionContext, onUnsub: (unsub: () => void) => void) {
	ctx.ui.setFooter((tui, theme, footerData) => {
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
				const content = ` ` + modelStr + sep + theme.fg("dim", pct) + sep + theme.fg("dim", dir);
				return [truncateToWidth(content, width, "")];
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

	pi.on("tool_call", async (_event, ctx) => {
		if (process.env.PI_SUBAGENT === "1") return { block: false };
		const usage = ctx.getContextUsage();
		const result = shouldBlockForCompaction(usage?.percent);

		if (result.block) {
			requestAutoCompact(ctx, pi);
			return { block: true, reason: result.reason };
		}

		return { block: false };
	});

	let warnedThisTurn = false;
	pi.on("before_agent_start", async (_event, ctx) => {
		if (process.env.PI_SUBAGENT === "1") return;
		const usage = ctx.getContextUsage();
		const result = shouldBlockForCompaction(usage?.percent);

		if (result.level === "warn") {
			if (!warnedThisTurn) {
				warnedThisTurn = true;
				ctx.ui.notify(
					`Context at ${Math.round(usage?.percent ?? 0)}% — consider running /compact soon`,
					"warning",
				);
			}
		} else if (result.level === "ok") {
			warnedThisTurn = false;
		} else if (result.block) {
			requestAutoCompact(ctx, pi);
		}

		finalizeCompactStatus(ctx);
	});

	pi.on("session_shutdown", async () => {
		if (branchUnsub) {
			branchUnsub();
			branchUnsub = null;
		}
	});
}
