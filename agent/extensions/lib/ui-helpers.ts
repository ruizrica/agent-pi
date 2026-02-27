// ABOUTME: Shared TUI helpers — padRight, wordWrap, sideBySide
// ABOUTME: Used by agent-team.ts and other extensions that need text layout utilities

import { visibleWidth, truncateToWidth } from "@mariozechner/pi-tui";

/** Pad a string with spaces to reach the target visible width, truncating if too long. */
export function padRight(s: string, width: number): string {
	const vis = visibleWidth(s);
	if (vis >= width) return truncateToWidth(s, width, "");
	return s + " ".repeat(width - vis);
}

/** Word-wrap text to fit within a given visible width, breaking long words if needed. */
export function wordWrap(text: string, width: number): string[] {
	if (visibleWidth(text) <= width) return [text];
	const words = text.split(/(\s+)/);
	const lines: string[] = [];
	let cur = "";
	for (const w of words) {
		const wordWidth = visibleWidth(w);
		// If a single word is longer than width, break it
		if (wordWidth > width) {
			if (cur.length > 0) {
				lines.push(cur);
				cur = "";
			}
			// Break long word into chunks
			let remaining = w;
			while (remaining.length > 0) {
				let chunk = "";
				for (const char of remaining) {
					if (visibleWidth(chunk + char) > width && chunk.length > 0) {
						lines.push(chunk);
						chunk = char;
					} else {
						chunk += char;
					}
				}
				if (chunk.length > 0) {
					cur = chunk;
				}
				remaining = "";
			}
		} else if (visibleWidth(cur + w) > width && cur.length > 0) {
			lines.push(cur);
			cur = w.trimStart();
		} else {
			cur += w;
		}
	}
	if (cur.length > 0) lines.push(cur);
	return lines;
}

/** Merge two column arrays side-by-side with a divider string between them. */
export function sideBySide(
	left: string[], right: string[],
	leftW: number, rightW: number,
	divider: string,
): string[] {
	const max = Math.max(left.length, right.length);
	const result: string[] = [];
	for (let i = 0; i < max; i++) {
		const l = i < left.length ? padRight(left[i], leftW) : " ".repeat(leftW);
		const r = i < right.length ? truncateToWidth(right[i], rightW, "") : "";
		result.push(l + divider + r);
	}
	return result;
}
