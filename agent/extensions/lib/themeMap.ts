// ABOUTME: Per-extension default theme assignments mapping extension filenames to themes.
// ABOUTME: Each extension calls applyExtensionDefaults() in session_start to load its theme.
/**
 * themeMap.ts — Per-extension default theme assignments
 *
 * Themes live in .pi/themes/ and are mapped by extension filename (no extension).
 * Each extension calls applyExtensionTheme(import.meta.url, ctx) in its session_start
 * hook to automatically load its designated theme on boot.
 *
 * Available themes (.pi/themes/):
 *   monochrome-blue
 */

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { basename } from "path";
import { fileURLToPath } from "url";

// ── Theme assignments ──────────────────────────────────────────────────────
//
// Key   = extension filename without extension (matches extensions/<key>.ts)
// Value = theme name from .pi/themes/<value>.json
//
export const THEME_MAP: Record<string, string> = {
	"agent-banner":       "midnight-ocean",
	"agent-chain":        "midnight-ocean",
	"agent-team":         "midnight-ocean",
	"cross-agent":        "midnight-ocean",
	"damage-control":     "midnight-ocean",
	"minimal":            "midnight-ocean",
	"pi-pi":              "midnight-ocean",
	"pure-focus":         "midnight-ocean",
	"purpose-gate":       "midnight-ocean",
	"session-replay":     "midnight-ocean",
	"subagent-widget":    "midnight-ocean",
	"system-select":      "midnight-ocean",
	"theme-cycler":       "midnight-ocean",
	"mic":                "midnight-ocean",
	"pipeline-team":      "midnight-ocean",
	"tasks":              "midnight-ocean",
	"plan-mode":          "midnight-ocean",
	"tool-counter":       "midnight-ocean",
	"tool-counter-widget":"midnight-ocean",
	"footer":             "midnight-ocean",
	"mode-cycler":        "midnight-ocean",
	"user-question":      "midnight-ocean",
	"plan-viewer":        "midnight-ocean",
	"completion-report":  "midnight-ocean",
	"sounds":             "midnight-ocean",
};

// ── Helpers ───────────────────────────────────────────────────────────────

/** Derive the extension name (e.g. "minimal") from its import.meta.url. */
function extensionName(fileUrl: string): string {
	const filePath = fileUrl.startsWith("file://") ? fileURLToPath(fileUrl) : fileUrl;
	return basename(filePath).replace(/\.[^.]+$/, "");
}

// ── Theme ──────────────────────────────────────────────────────────────────

/**
 * Apply the mapped theme for an extension on session boot.
 *
 * @param fileUrl   Pass `import.meta.url` from the calling extension file.
 * @param ctx       The ExtensionContext from the session_start handler.
 * @returns         true if the theme was applied successfully, false otherwise.
 */
export function applyExtensionTheme(fileUrl: string, ctx: ExtensionContext): boolean {
	if (!ctx.hasUI) return false;

	const name = extensionName(fileUrl);
	
	// If there are multiple extensions stacked in 'ipi', they each fire session_start
	// and try to apply their own mapped theme. The LAST one to fire wins.
	// Since system-select is last in the ipi alias array, it was setting 'catppuccin-mocha'.
	
	// We want to skip theme application for all secondary extensions if they are stacked,
	// so the primary extension (first in the array) dictates the theme.
	const primaryExt = primaryExtensionName();
	if (primaryExt && primaryExt !== name) {
		return true; // Pretend we succeeded, but don't overwrite the primary theme
	}

	let themeName = THEME_MAP[name];
	
	if (!themeName) {
		themeName = "midnight-ocean";
	}

	const result = ctx.ui.setTheme(themeName);

	if (!result.success && themeName !== "midnight-ocean") {
		return ctx.ui.setTheme("midnight-ocean").success;
	}
	
	return result.success;
}
// ── Title ──────────────────────────────────────────────────────────────────

/**
 * Read process.argv to find the first -e / --extension flag value.
 *
 * When Pi is launched as:
 *   pi -e extensions/subagent-widget.ts -e extensions/pure-focus.ts
 *
 * process.argv contains those paths verbatim. Every stacked extension calls
 * this and gets the same answer ("subagent-widget"), so all setTitle calls
 * are idempotent — no shared state or deduplication needed.
 *
 * Returns null if no -e flag is present (e.g. plain `pi` with no extensions).
 */
function primaryExtensionName(): string | null {
	const argv = process.argv;
	for (let i = 0; i < argv.length - 1; i++) {
		if (argv[i] === "-e" || argv[i] === "--extension") {
			return basename(argv[i + 1]).replace(/\.[^.]+$/, "");
		}
	}
	return null;
}

/**
 * Set the terminal title to "π - <first-extension-name>" on session boot.
 * Reads the title from process.argv so all stacked extensions agree on the
 * same value — no coordination or shared state required.
 *
 * Deferred 150 ms to fire after Pi's own startup title-set.
 */
function applyExtensionTitle(ctx: ExtensionContext): void {
	if (!ctx.hasUI) return;
	const name = primaryExtensionName();
	if (!name) return;
	setTimeout(() => ctx.ui.setTitle(`π - ${name}`), 150);
}

// ── Combined default ───────────────────────────────────────────────────────

/**
 * Apply both the mapped theme AND the terminal title for an extension.
 * Drop-in replacement for applyExtensionTheme — call this in every session_start.
 *
 * Usage:
 *   import { applyExtensionDefaults } from "./themeMap.ts";
 *
 *   pi.on("session_start", async (_event, ctx) => {
 *     applyExtensionDefaults(import.meta.url, ctx);
 *     // ... rest of handler
 *   });
 */
export function applyExtensionDefaults(fileUrl: string, ctx: ExtensionContext): void {
	applyExtensionTheme(fileUrl, ctx);
	applyExtensionTitle(ctx);
}
