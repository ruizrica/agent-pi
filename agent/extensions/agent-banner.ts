// ABOUTME: Displays ASCII art banner above the editor on session start.
// ABOUTME: Reads art from ~/Desktop/agent.txt or uses embedded default; hides on first input.
/**
 * Agent Banner — ASCII art at the top of the pi app on startup
 *
 * Displays the agent logo/banner above the editor when a session starts or when
 * switching to a new session (/new). Hides automatically on first user input.
 * Art is read from ~/Desktop/agent.txt, or falls back to embedded default.
 * Footer is handled by footer.ts (model widget + status bar).
 *
 * Usage: Add to packages in settings.json
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
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

function showBanner(ctx: ExtensionContext) {
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
}

export default function (pi: ExtensionAPI) {
	let bannerCtx: ExtensionContext | null = null;

	pi.on("session_start", async (_event, ctx: ExtensionContext) => {
		applyExtensionDefaults(import.meta.url, ctx);
		bannerCtx = ctx;
		showBanner(ctx);
	});

	// Show banner when switching to a new session (/new)
	pi.on("session_switch", async (_event, ctx: ExtensionContext) => {
		bannerCtx = ctx;
		showBanner(ctx);
	});

	// Hide banner on first user input — art shows only until you start typing
	pi.on("input", async () => {
		if (bannerCtx?.hasUI) {
			bannerCtx.ui.setWidget("agent-banner", undefined);
		}
	});
}
