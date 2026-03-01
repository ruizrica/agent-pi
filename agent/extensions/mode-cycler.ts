// ABOUTME: Cycles operational modes (NORMAL/PLAN/SPEC/PIPELINE/TEAM/CHAIN) via Shift+Tab.
// ABOUTME: Gates which extension's before_agent_start fires and injects PLAN/SPEC prompts.

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text } from "@mariozechner/pi-tui";
import { outputLine } from "./lib/output-box.ts";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { MODES, nextMode, modeLabel, modeTextAnsi, type Mode } from "./lib/mode-cycler-logic.ts";
import { PLAN_PROMPT, SPEC_PROMPT, buildNormalPrompt } from "./lib/mode-prompts.ts";
import { writeFileSync } from "fs";
import { showBanner, isBannerVisible } from "./agent-banner.ts";

const MODE_FILE = "/tmp/pi-current-mode.txt";

// ANSI escape codes for mode block background colors
const ANSI_BG: Record<Mode, string> = {
	NORMAL: "",
	PLAN: "\x1b[44m",       // blue bg
	SPEC: "\x1b[46m",       // cyan bg
	PIPELINE: "\x1b[42m",   // green bg
	TEAM: "\x1b[43m",       // yellow bg
	CHAIN: "\x1b[41m",      // red bg
};
const RESET = "\x1b[0m";

export default function (pi: ExtensionAPI) {
	let currentMode: Mode = "NORMAL";

	function updateWidgets(mode: Mode, ctx: ExtensionContext) {
		if (!ctx.hasUI) return;

		if (mode === "NORMAL") {
			ctx.ui.setWidget("mode-block", undefined);
			// Re-set agent-banner after clearing mode-block to ensure correct rendering order
			// Only re-set if banner was previously visible (not hidden by user input)
			if (isBannerVisible()) {
				showBanner(ctx);
			}
			return;
		}

		const bg = ANSI_BG[mode];
		const fg = modeTextAnsi(mode);

		// Mode block — full-width colored banner with mode name
		ctx.ui.setWidget(
			"mode-block",
			(_tui, _theme) => ({
				invalidate() {},
				render(width: number): string[] {
					const label = ` ${mode} `;
					const pad = " ".repeat(Math.max(0, width - label.length));
					return [`${bg}${fg}${label}${pad}${RESET}`];
				},
			}),
			{ placement: "aboveEditor" },
		);

		// Re-set agent-banner after setting mode-block to ensure it renders above the bar
		// This maintains the visual hierarchy: agent-banner (logo) → mode-block (bar) → editor
		// Only re-set if banner was previously visible (not hidden by user input)
		if (isBannerVisible()) {
			showBanner(ctx);
		}
	}

	function setMode(mode: Mode, ctx: ExtensionContext) {
		currentMode = mode;
		(globalThis as any).__piCurrentMode = mode;

		// Write to temp file for statusline
		try { writeFileSync(MODE_FILE, mode, "utf-8"); } catch {}

		if (ctx.hasUI) {
			ctx.ui.setStatus("mode", modeLabel(mode));
		}

		updateWidgets(mode, ctx);
	}

	// ── Shift+Tab: cycle forward ──────────────────

	pi.registerShortcut("shift+tab", {
		description: "Cycle operational mode",
		handler: async (ctx) => {
			setMode(nextMode(currentMode), ctx);
		},
	});

	// ── /mode command ─────────────────────────────

	pi.registerCommand("mode", {
		description: "Set mode: /mode or /mode <MODE>",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) return;

			const arg = args.trim().toUpperCase();
			if (arg && MODES.includes(arg as Mode)) {
				setMode(arg as Mode, ctx);
				return;
			}

			if (arg) {
				ctx.ui.notify(`Unknown mode: ${arg}. Valid: ${MODES.join(", ")}`, "error");
				return;
			}

			// Picker
			const items = MODES.map(m => {
				const active = m === currentMode ? " (active)" : "";
				return `${m}${active}`;
			});
			const selected = await ctx.ui.select("Select Mode", items);
			if (!selected) return;

			const name = selected.split(/\s/)[0] as Mode;
			setMode(name, ctx);
		},
	});

	// ── set_mode tool (autonomous mode switching) ──

	pi.registerTool({
		name: "set_mode",
		label: "Set Mode",
		description: "Switch the operational mode. Call this from NORMAL mode to activate PLAN, SPEC, TEAM, CHAIN, or PIPELINE based on task classification.",
		parameters: Type.Object({
			mode: Type.String({ description: "Target mode: NORMAL, PLAN, SPEC, PIPELINE, TEAM, or CHAIN" }),
			reason: Type.Optional(Type.String({ description: "Why this mode was chosen" })),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { mode: target, reason } = params as { mode: string; reason?: string };
			const upper = target.toUpperCase();

			if (!MODES.includes(upper as Mode)) {
				return {
					content: [{ type: "text", text: `Unknown mode: ${target}. Valid: ${MODES.join(", ")}` }],
					details: { error: true },
				};
			}

			setMode(upper as Mode, ctx);
			const msg = reason
				? `Mode set to ${upper}. Reason: ${reason}`
				: `Mode set to ${upper}.`;

			return {
				content: [{ type: "text", text: msg }],
				details: { mode: upper, reason },
			};
		},

		renderCall(args, theme) {
			const target = (args as any).mode || "?";
			const reason = (args as any).reason || "";
			const preview = reason.length > 50 ? reason.slice(0, 47) + "..." : reason;
			const text =
				theme.fg("toolTitle", theme.bold("set_mode ")) +
				theme.fg("accent", target.toUpperCase()) +
				(preview ? theme.fg("dim", " — ") + theme.fg("muted", preview) : "");
			return new Text(outputLine(theme, "accent", text), 0, 0);
		},

		renderResult(result, _options, theme) {
			const text = result.content[0];
			const msg = text?.type === "text" ? text.text : "";
			return new Text(outputLine(theme, "success", msg), 0, 0);
		},
	});

	// ── System prompt injection per mode ─────────

	pi.on("before_agent_start", async (_event, _ctx) => {
		if (currentMode === "NORMAL") {
			const g = globalThis as any;
			return { systemPrompt: buildNormalPrompt({
				commanderAvailable: !!g.__piCommanderAvailable,
				activeChain: g.__piActiveChain || null,
				activePipeline: g.__piActivePipeline || null,
			})};
		}
		if (currentMode === "PLAN") return { systemPrompt: PLAN_PROMPT };
		if (currentMode === "SPEC") return { systemPrompt: SPEC_PROMPT };
		return {};
	});

	// ── Session init ──────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
		currentMode = "NORMAL";
		(globalThis as any).__piCurrentMode = "NORMAL";
		try { writeFileSync(MODE_FILE, "NORMAL", "utf-8"); } catch {}
		if (ctx.hasUI) {
			ctx.ui.setStatus("mode", "");
		}
		updateWidgets("NORMAL", ctx);
	});

	// ── Session switch (/new) ──────────────────────

	pi.on("session_switch", async (_event, ctx) => {
		// Re-apply current mode widgets after banner is shown to ensure correct rendering order
		// The banner is shown in agent-banner.ts's session_switch handler, so we need to
		// re-set widgets here to ensure mode-block (if any) renders before banner is re-set
		// Use process.nextTick to ensure banner's session_switch handler runs first
		process.nextTick(() => {
			updateWidgets(currentMode, ctx);
		});
	});
}
