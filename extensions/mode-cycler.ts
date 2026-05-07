// ABOUTME: Cycles operational modes (NORMAL/PLAN/INVESTIGATE/SPEC/PIPELINE/TEAM/CHAIN) via Shift+Tab.
// ABOUTME: Gates which extension's before_agent_start fires and injects NORMAL/PLAN/INVESTIGATE/SPEC prompts.

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text } from "@mariozechner/pi-tui";
import { outputLine } from "./lib/output-box.ts";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import { MODES, nextMode, modeLabel, modeBgAnsi, modeTextAnsi, modeDisplayName, DEFAULT_MODE_OVERLAY, type Mode, type ModeOverlayState } from "./lib/mode-cycler-logic.ts";
import { checkGemmaHealth, checkQwenHealth } from "./gemma-overlay.ts";
import { buildPlanPrompt, buildSpecPrompt, buildNormalPrompt, buildInvestigatePrompt } from "./lib/mode-prompts.ts";
import { writeFileSync } from "fs";
import { showBanner, isBannerVisible } from "./agent-banner.ts";

const MODE_FILE = "/tmp/pi-current-mode.txt";


export default function (pi: ExtensionAPI) {
	let currentMode: Mode = "NORMAL";
	let currentOverlay: ModeOverlayState = { ...DEFAULT_MODE_OVERLAY };

	function updateWidgets(mode: Mode, ctx: ExtensionContext) {
		if (!ctx.hasUI) return;
		if ((globalThis as any).__piSummaryModeActive) {
			ctx.ui.setWidget("mode-block", undefined);
			return;
		}

		if (mode === "NORMAL") {
			ctx.ui.setWidget("mode-block", undefined);
			// Re-set agent-banner after clearing mode-block to ensure correct rendering order
			// Only re-set if banner was previously visible (not hidden by user input)
			if (isBannerVisible()) {
				showBanner(ctx);
			}
			return;
		}

		// Mode block — full-width colored banner with mode name
		// Uses theme accent color (same as model name in footer)
		ctx.ui.setWidget(
			"mode-block",
			(_tui, _theme) => ({
				invalidate() {},
				render(width: number): string[] {
					const bg = modeBgAnsi(mode, currentOverlay);
					const text = modeTextAnsi(mode, currentOverlay);
					const reset = "\x1b[0m";
					const label = ` ${modeDisplayName(mode, currentOverlay)} `;
					const pad = " ".repeat(Math.max(0, width - label.length));
					return [bg + text + label + pad + reset];
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

	// Expose refresh function so other extensions (e.g. agent-team) can re-pin
	// the mode-block as the last aboveEditor widget (closest to the editor input).
	function refreshModeBlock(ctx: ExtensionContext) {
		updateWidgets(currentMode, ctx);
	}

	function syncOverlayGlobals() {
		(globalThis as any).__piClaudeOverlay = currentOverlay.claude;
		(globalThis as any).__piGemmaOverlay = currentOverlay.gemma;
		(globalThis as any).__piQwenOverlay = currentOverlay.qwen;
		(globalThis as any).__piModeOverlay = { ...currentOverlay };
	}

	function writeModeFile(mode: Mode) {
		try { writeFileSync(MODE_FILE, modeDisplayName(mode, currentOverlay), "utf-8"); } catch {}
	}

	function setClaudeOverlay(enabled: boolean, ctx: ExtensionContext) {
		// Mutual exclusion: disable local overlays when enabling Claude
		if (enabled) currentOverlay = { ...currentOverlay, claude: true, gemma: false, qwen: false };
		else currentOverlay = { ...currentOverlay, claude: false };
		syncOverlayGlobals();
		writeModeFile(currentMode);
		if (ctx.hasUI && !(globalThis as any).__piSummaryModeActive) {
			ctx.ui.setStatus("mode", modeLabel(currentMode, currentOverlay));
		}
		updateWidgets(currentMode, ctx);
	}

	function setGemmaOverlay(enabled: boolean, ctx: ExtensionContext) {
		// Mutual exclusion: disable Claude and Qwen when enabling Gemma
		if (enabled) currentOverlay = { ...currentOverlay, gemma: true, claude: false, qwen: false };
		else currentOverlay = { ...currentOverlay, gemma: false };
		syncOverlayGlobals();
		writeModeFile(currentMode);
		if (ctx.hasUI && !(globalThis as any).__piSummaryModeActive) {
			ctx.ui.setStatus("mode", modeLabel(currentMode, currentOverlay));
		}
		updateWidgets(currentMode, ctx);
	}

	function setQwenOverlay(enabled: boolean, ctx: ExtensionContext) {
		// Mutual exclusion: disable Claude and Gemma when enabling Qwen
		if (enabled) currentOverlay = { ...currentOverlay, qwen: true, claude: false, gemma: false };
		else currentOverlay = { ...currentOverlay, qwen: false };
		syncOverlayGlobals();
		writeModeFile(currentMode);
		if (ctx.hasUI && !(globalThis as any).__piSummaryModeActive) {
			ctx.ui.setStatus("mode", modeLabel(currentMode, currentOverlay));
		}
		updateWidgets(currentMode, ctx);
	}

	function setMode(mode: Mode, ctx: ExtensionContext) {
		currentMode = mode;
		(globalThis as any).__piCurrentMode = mode;
		syncOverlayGlobals();

		// Write to temp file for statusline
		writeModeFile(mode);

		if (ctx.hasUI && !(globalThis as any).__piSummaryModeActive) {
			ctx.ui.setStatus("mode", modeLabel(mode, currentOverlay));
		}

		// Publish refresh callback so other aboveEditor widgets can re-pin the mode bar
		(globalThis as any).__piRefreshModeBlock = () => refreshModeBlock(ctx);

		updateWidgets(mode, ctx);
	}

	// ── Shift+Tab: cycle forward ──────────────────

	pi.registerShortcut("shift+tab", {
		description: "Cycle operational mode",
		handler: async (ctx) => {
			setMode(nextMode(currentMode), ctx);
		},
	});

	// ── /thinking command ─────────────────────────

	const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];

	pi.registerCommand("thinking", {
		description: "Set thinking level: /thinking or /thinking <LEVEL>",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) return;

			const arg = args.trim().toLowerCase();
			if (arg && THINKING_LEVELS.includes(arg)) {
				pi.setThinkingLevel(arg);
				ctx.ui.notify(`Thinking: ${arg}`);
				return;
			}

			if (arg) {
				ctx.ui.notify(`Unknown level: ${arg}. Valid: ${THINKING_LEVELS.join(", ")}`, "error");
				return;
			}

			// Picker
			const current = pi.getThinkingLevel();
			const items = THINKING_LEVELS.map(l => {
				const active = l === current ? " (active)" : "";
				return `${l}${active}`;
			});
			const selected = await ctx.ui.select("Select Thinking Level", items);
			if (!selected) return;

			const level = selected.split(/\s/)[0];
			pi.setThinkingLevel(level);
			ctx.ui.notify(`Thinking: ${level}`);
		},
		autocomplete: (partial) => {
			return THINKING_LEVELS.filter(l => l.startsWith(partial.toLowerCase()));
		},
	});

	// ── /mode command ─────────────────────────────

	pi.registerCommand("claude", {
		description: "Toggle Claude overlay for the current operational mode",
		handler: async (args, ctx) => {
			const arg = args.trim().toLowerCase();
			if (["on", "enable", "enabled"].includes(arg)) {
				setClaudeOverlay(true, ctx);
				ctx.ui.notify(`Claude overlay enabled${currentMode === "NORMAL" ? "" : ` for ${modeDisplayName(currentMode, currentOverlay)}`}`);
				return;
			}
			if (["off", "disable", "disabled"].includes(arg)) {
				setClaudeOverlay(false, ctx);
				ctx.ui.notify("Claude overlay disabled");
				return;
			}
			if (arg && arg !== "toggle") {
				ctx.ui.notify("Usage: /claude [on|off|toggle]", "error");
				return;
			}
			const next = !currentOverlay.claude;
			setClaudeOverlay(next, ctx);
			ctx.ui.notify(next ? `Claude overlay enabled${currentMode === "NORMAL" ? "" : ` for ${modeDisplayName(currentMode, currentOverlay)}`}` : "Claude overlay disabled");
		},
	});

	pi.registerCommand("gemma", {
		description: "Toggle Gemma overlay — route builders to local LM Studio Gemma 4",
		handler: async (args, ctx) => {
			const arg = args.trim().toLowerCase();
			if (["on", "enable", "enabled"].includes(arg)) {
				const ok = await checkGemmaHealth(ctx);
				if (!ok) return;
				setGemmaOverlay(true, ctx);
				ctx.ui.notify(`Gemma overlay enabled${currentMode === "NORMAL" ? "" : ` for ${modeDisplayName(currentMode, currentOverlay)}`}`);
				return;
			}
			if (["off", "disable", "disabled"].includes(arg)) {
				setGemmaOverlay(false, ctx);
				ctx.ui.notify("Gemma overlay disabled");
				return;
			}
			if (arg && arg !== "toggle") {
				ctx.ui.notify("Usage: /gemma [on|off|toggle]", "error");
				return;
			}
			const next = !currentOverlay.gemma;
			if (next) {
				const ok = await checkGemmaHealth(ctx);
				if (!ok) return;
			}
			setGemmaOverlay(next, ctx);
			ctx.ui.notify(next ? `Gemma overlay enabled${currentMode === "NORMAL" ? "" : ` for ${modeDisplayName(currentMode, currentOverlay)}`}` : "Gemma overlay disabled");
		},
	});

	pi.registerCommand("qwen", {
		description: "Toggle Qwen overlay — route builders to local LM Studio Qwen 3.6",
		handler: async (args, ctx) => {
			const arg = args.trim().toLowerCase();
			if (["on", "enable", "enabled"].includes(arg)) {
				const ok = await checkQwenHealth(ctx);
				if (!ok) return;
				setQwenOverlay(true, ctx);
				ctx.ui.notify(`Qwen overlay enabled${currentMode === "NORMAL" ? "" : ` for ${modeDisplayName(currentMode, currentOverlay)}`}`);
				return;
			}
			if (["off", "disable", "disabled"].includes(arg)) {
				setQwenOverlay(false, ctx);
				ctx.ui.notify("Qwen overlay disabled");
				return;
			}
			if (arg && arg !== "toggle") {
				ctx.ui.notify("Usage: /qwen [on|off|toggle]", "error");
				return;
			}
			const next = !currentOverlay.qwen;
			if (next) {
				const ok = await checkQwenHealth(ctx);
				if (!ok) return;
			}
			setQwenOverlay(next, ctx);
			ctx.ui.notify(next ? `Qwen overlay enabled${currentMode === "NORMAL" ? "" : ` for ${modeDisplayName(currentMode, currentOverlay)}`}` : "Qwen overlay disabled");
		},
	});

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
		description: "Switch the operational mode. Call this from NORMAL mode to activate PLAN, INVESTIGATE, SPEC, TEAM, CHAIN, or PIPELINE based on task classification.",
		parameters: Type.Object({
			mode: Type.String({ description: "Target mode: NORMAL, PLAN, INVESTIGATE, SPEC, PIPELINE, TEAM, or CHAIN" }),
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
			const display = modeDisplayName(upper as Mode, currentOverlay);
			const msg = reason
				? `Mode set to ${display}. Reason: ${reason}`
				: `Mode set to ${display}.`;

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
		const g = globalThis as any;
		const scoutId = typeof g.__piScoutId === "number" ? g.__piScoutId : null;
		const selectedAdvisorModel = (_ctx as any)?.model?.name || null;
		const promptOpts = {
			commanderAvailable: !!g.__piCommanderAvailable,
			activeChain: g.__piActiveChain || null,
			activePipeline: g.__piActivePipeline || null,
			scoutId,
			selectedAdvisorModel,
		};
		if (currentMode === "NORMAL") {
			return { systemPrompt: buildNormalPrompt(promptOpts) };
		}
		if (currentMode === "PLAN") return { systemPrompt: buildPlanPrompt(promptOpts) };
		if (currentMode === "INVESTIGATE") return { systemPrompt: buildInvestigatePrompt(promptOpts) };
		if (currentMode === "SPEC") return { systemPrompt: buildSpecPrompt(promptOpts) };
		return {};
	});

	// ── Mode switching callback for approval-triggered transitions ──

	/**
	 * Set mode immediately after plan approval.
	 * Used by plan-viewer.ts to trigger auto mode switching.
	 * Exposed as global function so other extensions can invoke it.
	 */
	function setModeForApproval(mode: Mode, ctx: ExtensionContext): void {
		setMode(mode, ctx);
	}

	(globalThis as any).__piSetModeForApproval = (mode: string, ctx: ExtensionContext) => {
		const upper = mode.toUpperCase();
		if (MODES.includes(upper as Mode)) {
			setModeForApproval(upper as Mode, ctx);
		}
	};

	// ── Session init ──────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
		currentMode = "NORMAL";
		currentOverlay = { ...DEFAULT_MODE_OVERLAY };
		(globalThis as any).__piCurrentMode = "NORMAL";
		syncOverlayGlobals();
		(globalThis as any).__piRefreshModeBlock = () => refreshModeBlock(ctx);
		(globalThis as any).__piSetModeForApproval = (mode: string, ctxArg: ExtensionContext) => {
			const upper = mode.toUpperCase();
			if (MODES.includes(upper as Mode)) {
				setModeForApproval(upper as Mode, ctxArg);
			}
		};
		writeModeFile("NORMAL");
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
