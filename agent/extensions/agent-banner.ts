/**
 * Agent Banner — ASCII art at the top of the pi app on startup
 *
 * Displays the agent logo/banner above the editor when a session starts.
 * Art is read from ~/Desktop/agent.txt, or falls back to embedded default.
 * Also sets our footer (model | context % | directory) — deferred so it wins over defaults.
 *
 * Usage: Add to packages in settings.json
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";
import { readFileSync, existsSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { homedir } from "node:os";
import { applyExtensionDefaults } from "./lib/themeMap.ts";

const DEFAULT_ART = `                             ▄▄   
█████▄ ▄████▄ ▄████▄ █████▄ ▄██▄▄▄
▄▄▄▄██ ██  ██ ██▄▄██ ██  ██ ▀██▀▀▀
██▄▄██ ██▄▄██ ██▄▄▄▄ ██  ██  ██▄▄▄
 ▀▀▀▀▀  ▀▀▀██  ▀▀▀▀▀ ▀▀  ▀▀   ▀▀▀▀
        ████▀                     `;

function loadArt(): string {
	const path = join(homedir(), "Desktop", "agent.txt");
	if (existsSync(path)) {
		try {
			return readFileSync(path, "utf-8").trimEnd();
		} catch {
			// fall through to default
		}
	}
	return DEFAULT_ART;
}

/** Turn a model name like "Claude 4 Opus" into "opus 4" */
function shortModelName(name: string | undefined): string {
	if (!name) return "no model";
	const cleaned = name.replace(/^claude\s*/i, "").trim();
	const tokens = cleaned.split(/\s+/);
	const versions: string[] = [];
	const words: string[] = [];
	for (const t of tokens) {
		if (/^[\d.]+$/.test(t)) versions.push(t);
		else words.push(t.toLowerCase());
	}
	return [...words, ...versions].join(" ") || name.toLowerCase();
}

/** Last two path components: "Github-Work/pi-vs-claude-code" */
function shortDir(cwd: string): string {
	const child = basename(cwd);
	const parent = basename(dirname(cwd));
	return parent ? `${parent}/${child}` : child;
}

function setupFooter(ctx: ExtensionContext): void {
	ctx.ui.setFooter((tui, theme, footerData) => {
		const unsub = footerData.onBranchChange(() => tui.requestRender());
		return {
			dispose: unsub,
			invalidate() {},
			render(width: number): string[] {
				const model = shortModelName(ctx.model?.name);
				const usage = ctx.getContextUsage();
				const pct = usage?.percent != null ? `${Math.round(usage.percent)}%` : "–";
				const dir = shortDir(ctx.cwd);
				const sep = theme.fg("dim", " | ");
				const content = theme.fg("dim", ` ${model}`) + sep + theme.fg("dim", pct) + sep + theme.fg("dim", dir);
				return [truncateToWidth(content, width, "")];
			},
		};
	});
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx: ExtensionContext) => {
		applyExtensionDefaults(import.meta.url, ctx);

		if (!ctx.hasUI) return;

		const art = loadArt();
		const split = art.split("\n");
		const firstNonEmpty = split.findIndex((l) => l.trim() !== "");
		const lines = firstNonEmpty >= 0 ? split.slice(firstNonEmpty) : split;

		ctx.ui.setWidget(
			"agent-banner",
			(_tui, theme) => ({
				invalidate() {},
				render(width: number): string[] {
					const rendered = lines.map((line) => theme.fg("accent", line));
					rendered.push("");
					return rendered;
				},
			}),
			{ placement: "aboveEditor" },
		);

		// Defer footer so it runs after Pi's default — ensures our footer wins
		setTimeout(() => setupFooter(ctx), 0);
	});
}
