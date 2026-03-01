// ABOUTME: Standardized output box utility — colored left bar for extension output
// ABOUTME: Used by renderCall/renderResult and widgets for consistent visual formatting

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

/** Two full-block chars for the left bar */
export const BAR = "\u2588\u2588";

/**
 * Render a single output line with colored left bar.
 * Format: `BAR SPACE content`
 */
export function outputLine(theme: OutputBoxTheme, bar: BarColor, content: string): string {
	return `${theme.fg(bar, BAR)} ${content}`;
}

/**
 * Wrap multiple lines in a consistent output box — each line gets the bar + bg.
 */
export function outputBox(theme: OutputBoxTheme, bar: BarColor, lines: string[]): string[] {
	return lines.map(line => outputLine(theme, bar, line));
}

/**
 * Format a compact TOOLBOX summary line.
 * Example: `██ TOOLBOX: GREP (3x) src/auth.ts, READ (1x) config.json`
 */
export function formatToolbox(theme: OutputBoxTheme, tools: ToolCallSummary[]): string {
	const parts = tools.map(t => {
		const entry = `${t.name} (${t.count}x)`;
		return t.hint ? `${entry} ${t.hint}` : entry;
	});
	const content = theme.bold("TOOLBOX") + ": " + parts.join(", ");
	return outputLine(theme, "accent", content);
}
