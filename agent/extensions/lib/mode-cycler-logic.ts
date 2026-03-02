// ABOUTME: Pure functions for cycling operational modes (NORMAL, PLAN, SPEC, PIPELINE, TEAM, CHAIN).
// ABOUTME: No side effects — used by mode-cycler.ts extension and tested independently.

export const MODES = ["NORMAL", "PLAN", "SPEC", "PIPELINE", "TEAM", "CHAIN"] as const;
export type Mode = typeof MODES[number];

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

const MODE_TEXT_ANSI: Record<Mode, string> = {
	NORMAL: "",
	PLAN: BOLD_WHITE,
	SPEC: BOLD_WHITE,
	PIPELINE: BOLD_WHITE,
	TEAM: BOLD_WHITE,
	CHAIN: BOLD_WHITE,
};

/** ANSI text color for the mode bar. Dark gray on light backgrounds, bold white on dark. */
export function modeTextAnsi(mode: Mode): string {
	return MODE_TEXT_ANSI[mode];
}

/** Status label for a mode. NORMAL returns empty string, others return "[MODE]". */
export function modeLabel(mode: Mode): string {
	return mode === "NORMAL" ? "" : `[${mode}]`;
}
