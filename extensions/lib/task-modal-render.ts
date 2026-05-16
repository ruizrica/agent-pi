// ABOUTME: Pure render helpers for the /tasks task-details modal.
// ABOUTME: Keeps long work summaries readable by wrapping instead of truncating.

export interface TaskModalTheme {
	fg: (color: string, text: string) => string;
}

function wrapWordsForWidth(text: string, maxWidth: number): string[] {
	const words = text.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return [];
	const safeWidth = Math.max(1, maxWidth);
	const lines: string[] = [];
	let current = "";

	for (const word of words) {
		if (current.length === 0) {
			current = word;
		} else if (current.length + 1 + word.length <= safeWidth) {
			current += ` ${word}`;
		} else {
			lines.push(current);
			current = word;
		}

		while (current.length > safeWidth) {
			lines.push(current.slice(0, safeWidth));
			current = current.slice(safeWidth);
		}
	}

	if (current.length > 0) lines.push(current);
	return lines;
}

export function renderTaskModalWorkSummary(description: string, width: number, theme: TaskModalTheme): string[] {
	const label = "Work Summary:";
	const firstLinePrefix = `  ${label} `;
	const continuationPrefix = "    ";
	const firstLineWidth = Math.max(12, width - firstLinePrefix.length);
	const continuationWidth = Math.max(12, width - continuationPrefix.length);
	const wrapped = wrapWordsForWidth(description, firstLineWidth);
	const [first = "", ...rest] = wrapped;
	const lines = [`${theme.fg("accent", `  ${label}`)} ${theme.fg("muted", first)}`];

	for (const line of rest.flatMap(part => wrapWordsForWidth(part, continuationWidth))) {
		lines.push(`${continuationPrefix}${theme.fg("muted", line)}`);
	}

	return lines;
}
