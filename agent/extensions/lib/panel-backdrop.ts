// ABOUTME: Panel backdrop utility for fullscreen overlay UIs
// ABOUTME: Centers a panel vertically, fills dark background, and clamps output to terminal height

/**
 * Renders a panel centered on a dark backdrop, always returning exactly `height` lines.
 * Truncates panelLines if they exceed available space.
 */
export function renderPanelBackdrop(
	panelLines: string[],
	panelW: number,
	width: number,
	height: number,
): string[] {
	if (height <= 0) return [];

	const dimBg = "\x1b[48;2;10;10;15m";
	const reset = "\x1b[0m";
	const darkRow = dimBg + " ".repeat(width) + reset;
	const padLeft = Math.max(0, Math.floor((width - panelW) / 2));
	const padLeftStr = dimBg + " ".repeat(padLeft);
	const padRightCount = Math.max(0, width - panelW - padLeft);
	const padRightStr = " ".repeat(padRightCount) + reset;

	// Clamp panel to available height (reserve at least 1 line top + 1 bottom padding)
	const maxPanel = Math.max(0, height - 2);
	const visible = panelLines.length > maxPanel ? panelLines.slice(0, maxPanel) : panelLines;

	const topPad = Math.max(1, Math.floor((height - visible.length) / 2));
	const result: string[] = [];

	for (let i = 0; i < topPad; i++) result.push(darkRow);
	for (const line of visible) {
		result.push(padLeftStr + line + padRightStr);
	}
	while (result.length < height) result.push(darkRow);

	return result.slice(0, height);
}
