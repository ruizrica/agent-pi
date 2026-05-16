// ABOUTME: Pure render logic for the GOAL MET terminal widget.
// ABOUTME: Produces compact width-aware CLI/TUI lines for completed GOAL mode sessions.

export interface GoalMetState {
	goal: string;
	successCondition: string;
	summary?: string;
	evidence?: string[];
	nextSteps?: string[];
	completedAt: number;
	iterations?: number;
}

export interface GoalMetTheme {
	fg: (color: string, text: string) => string;
	bold: (text: string) => string;
}

export interface GoalMetResult {
	lines: string[];
}

function wrapWords(text: string, maxWidth: number): string[] {
	const words = text.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return [];
	const lines: string[] = [];
	let current = "";

	for (const word of words) {
		if (current.length === 0) current = word;
		else if (current.length + 1 + word.length <= maxWidth) current += ` ${word}`;
		else {
			lines.push(current);
			current = word;
		}

		while (current.length > maxWidth) {
			lines.push(current.slice(0, maxWidth));
			current = current.slice(maxWidth);
		}
	}

	if (current.length > 0) lines.push(current);
	return lines;
}

function pushWrapped(lines: string[], label: string, text: string | undefined, contentWidth: number, theme: GoalMetTheme): void {
	if (!text?.trim()) return;
	const wrapped = wrapWords(text, Math.max(20, contentWidth - 4));
	if (wrapped.length === 0) return;
	lines.push(`  ${theme.fg("accent", label)}`);
	for (const line of wrapped) lines.push(`    ${theme.fg("muted", line)}`);
	lines.push("");
}

function pushBullets(lines: string[], label: string, items: string[] | undefined, contentWidth: number, theme: GoalMetTheme): void {
	const clean = (items || []).map((item) => item.trim()).filter(Boolean);
	if (clean.length === 0) return;
	lines.push(`  ${theme.fg("accent", label)}`);
	for (const item of clean.slice(0, 5)) {
		const wrapped = wrapWords(item, Math.max(20, contentWidth - 6));
		if (wrapped.length === 0) continue;
		lines.push(`    ${theme.fg("success", "•")} ${theme.fg("muted", wrapped[0])}`);
		for (const cont of wrapped.slice(1)) lines.push(`      ${theme.fg("muted", cont)}`);
	}
	if (clean.length > 5) lines.push(`    ${theme.fg("dim", `… +${clean.length - 5} more`)}`);
	lines.push("");
}

export function renderGoalMet(state: GoalMetState, width: number, theme: GoalMetTheme): GoalMetResult {
	const lines: string[] = [];
	const contentWidth = Math.max(30, width - 4);

	lines.push(
		theme.bold(theme.fg("success", "✓ GOAL MET")) +
		theme.fg("dim", " — ") +
		theme.fg("accent", state.goal || "Goal"),
	);

	pushWrapped(lines, "Success Condition:", state.successCondition, contentWidth, theme);
	pushWrapped(lines, "Summary:", state.summary, contentWidth, theme);
	pushBullets(lines, "Evidence:", state.evidence, contentWidth, theme);
	pushBullets(lines, "Next Steps:", state.nextSteps, contentWidth, theme);

	const footerParts = [theme.fg("success", "condition met")];
	if (typeof state.iterations === "number" && state.iterations > 0) {
		footerParts.push(theme.fg("dim", `${state.iterations} iteration${state.iterations === 1 ? "" : "s"}`));
	}
	footerParts.push(theme.fg("dim", new Date(state.completedAt).toLocaleString()));
	lines.push("  " + footerParts.join(theme.fg("dim", " · ")));

	return { lines };
}

/** Gold-green tinted background for the GOAL MET widget. */
export const GOAL_MET_BG = "\x1b[48;2;45;55;20m";
