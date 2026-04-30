// ABOUTME: Pure functions for cycling operational modes (NORMAL, PLAN, SPEC, PIPELINE, TEAM, CHAIN).
// ABOUTME: No side effects — used by mode-cycler.ts extension and tested independently.

export const MODES = ["NORMAL", "PLAN", "SPEC", "PIPELINE", "TEAM", "CHAIN"] as const;
export type Mode = typeof MODES[number];
export type ModeOverlay = "CLAUDE" | "GEMMA" | "QWEN";

export interface ModeOverlayState {
	claude: boolean;
	gemma: boolean;
	qwen: boolean;
}

export const DEFAULT_MODE_OVERLAY: ModeOverlayState = {
	claude: false,
	gemma: false,
	qwen: false,
};

/** Advance to the next mode in the cycle, wrapping CHAIN → NORMAL. */
export function nextMode(current: Mode): Mode {
	const idx = MODES.indexOf(current);
	return MODES[(idx + 1) % MODES.length];
}

/** Go back to the previous mode in the cycle, wrapping NORMAL → CHAIN. */
export function prevMode(current: Mode): Mode {
	const idx = MODES.indexOf(current);
	return MODES[(idx - 1 + MODES.length) % MODES.length];
}

const MODE_COLORS: Record<Mode, string> = {
	NORMAL: "",
	PLAN: "accent",
	SPEC: "accent",
	PIPELINE: "accent",
	TEAM: "accent",
	CHAIN: "accent",
};

/** Theme color name for a mode. NORMAL returns empty string (no color). */
export function modeColor(mode: Mode): string {
	return MODE_COLORS[mode];
}

const BOLD_WHITE = "\x1b[1;97m";
const BOLD_DARK = "\x1b[1;30m";
const DARK_ORANGE_BG = "\x1b[48;2;180;90;0m";
const GEMMA_GREEN_BG = "\x1b[48;2;20;140;80m"; // green for local Gemma overlay
const QWEN_PURPLE_BG = "\x1b[48;2;102;51;153m"; // purple for local Qwen overlay

const MODE_TEXT_ANSI: Record<Mode, string> = {
	NORMAL: "",
	PLAN: BOLD_WHITE,
	SPEC: BOLD_WHITE,
	PIPELINE: BOLD_WHITE,
	TEAM: BOLD_WHITE,
	CHAIN: BOLD_WHITE,
};

/** ANSI text color for the mode bar. Dark gray on light backgrounds, bold white on dark. */
export function modeTextAnsi(mode: Mode, overlay: ModeOverlayState = DEFAULT_MODE_OVERLAY): string {
	if ((overlay.claude || overlay.gemma) && mode !== "NORMAL") return BOLD_WHITE;
	return MODE_TEXT_ANSI[mode];
}

// ANSI escape codes for mode block background colors
const DODGER_BLUE_BG = "\x1b[48;2;30;144;255m"; // dodger blue rgb(30,144,255)
const ANSI_BG: Record<Mode, string> = {
	NORMAL: "",
	PLAN: DODGER_BLUE_BG,
	SPEC: DODGER_BLUE_BG,
	PIPELINE: DODGER_BLUE_BG,
	TEAM: DODGER_BLUE_BG,
	CHAIN: DODGER_BLUE_BG,
};

/** ANSI background color for the mode bar. Dodger blue for all active modes. */
export function modeBgAnsi(mode: Mode, overlay: ModeOverlayState = DEFAULT_MODE_OVERLAY): string {
	if (overlay.qwen && mode !== "NORMAL") return QWEN_PURPLE_BG;
	if (overlay.gemma && mode !== "NORMAL") return GEMMA_GREEN_BG;
	if (overlay.claude && mode !== "NORMAL") return DARK_ORANGE_BG;
	return ANSI_BG[mode];
}

export function modeDisplayName(mode: Mode, overlay: ModeOverlayState = DEFAULT_MODE_OVERLAY): string {
	if (overlay.qwen && mode !== "NORMAL") return `${mode} + QWEN`;
	if (overlay.gemma && mode !== "NORMAL") return `${mode} + GEMMA`;
	if (overlay.claude && mode !== "NORMAL") return `${mode} + CLAUDE`;
	return mode;
}

/** Status label for a mode. NORMAL returns empty string, others return "[MODE]". */
export function modeLabel(mode: Mode, overlay: ModeOverlayState = DEFAULT_MODE_OVERLAY): string {
	if (mode === "NORMAL") return "";
	return `[${modeDisplayName(mode, overlay)}]`;
}

export function isClaudeOverlayActive(overlay: ModeOverlayState | undefined | null): boolean {
	return !!overlay?.claude;
}

export function isGemmaOverlayActive(overlay: ModeOverlayState | undefined | null): boolean {
	return !!overlay?.gemma;
}

export function isQwenOverlayActive(overlay: ModeOverlayState | undefined | null): boolean {
	return !!overlay?.qwen;
}
