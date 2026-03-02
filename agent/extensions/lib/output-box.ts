// ABOUTME: Output formatting utility for extension output
// ABOUTME: Used by renderCall/renderResult and widgets for consistent text formatting

/** Theme interface matching RenderTheme from pipeline-render.ts */
export interface OutputBoxTheme {
	fg: (color: string, text: string) => string;
	bold: (text: string) => string;
}

export type BarColor = "accent" | "success" | "error" | "dim" | "warning";

export interface ToolCallSummary {
	name: string;
	count: number;
	hint?: string;
}

/**
 * Render a single output line (plain, no colored bar).
 */
export function outputLine(_theme: OutputBoxTheme, _bar: BarColor, content: string): string {
	return content;
}

/**
 * Wrap multiple lines — returns them as-is (no colored bar).
 */
export function outputBox(_theme: OutputBoxTheme, _bar: BarColor, lines: string[]): string[] {
	return lines;
}

/**
 * Format a compact TOOLBOX summary line.
 * Example: `TOOLBOX: GREP (3x) src/auth.ts, READ (1x) config.json`
 */
export function formatToolbox(theme: OutputBoxTheme, tools: ToolCallSummary[]): string {
	const parts = tools.map(t => {
		const entry = `${t.name} (${t.count}x)`;
		return t.hint ? `${entry} ${t.hint}` : entry;
	});
	return theme.bold("TOOLBOX") + ": " + parts.join(", ");
}
