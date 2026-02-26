/**
 * Footer — Dark status bar with model · context % · directory
 *
 * Three-line footer with vertical padding. Displays:
 *   model name (no kebab) | context % | last two path components
 *
 * Usage: pi -e ui/footer.ts
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { basename, dirname } from "node:path";
import { applyExtensionDefaults } from "./lib/themeMap.ts";

/** Turn a model name like "Claude 4 Opus" into "opus 4" */
function shortModelName(name: string | undefined): string {
	if (!name) return "no model";
	// Strip leading provider prefix (e.g. "Claude")
	const cleaned = name.replace(/^claude\s*/i, "").trim();
	// Split into tokens, pull out version-like parts and variant
	const tokens = cleaned.split(/\s+/);
	const versions: string[] = [];
	const words: string[] = [];
	for (const t of tokens) {
		if (/^[\d.]+$/.test(t)) versions.push(t);
		else words.push(t.toLowerCase());
	}
	// variant first, then version: "opus 4"
	const parts = [...words, ...versions];
	return parts.join(" ") || name.toLowerCase();
}

/** Last two path components: "Github-Work/pi-vs-claude-code" */
function shortDir(cwd: string): string {
	const child = basename(cwd);
	const parent = basename(dirname(cwd));
	return parent ? `${parent}/${child}` : child;
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
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
	});
}
