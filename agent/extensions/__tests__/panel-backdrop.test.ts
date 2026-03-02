// ABOUTME: Tests for panel-backdrop utility
// ABOUTME: Verifies dark backdrop rendering always returns exactly height lines

import { describe, it, expect } from "vitest";
import { renderPanelBackdrop } from "../lib/panel-backdrop.ts";

describe("renderPanelBackdrop", () => {
	it("returns exactly height lines when panel fits", () => {
		const panelLines = ["line 1", "line 2", "line 3"];
		const result = renderPanelBackdrop(panelLines, 40, 80, 24);
		expect(result).toHaveLength(24);
	});

	it("returns exactly height lines when panel overflows", () => {
		const panelLines = Array.from({ length: 50 }, (_, i) => `line ${i}`);
		const result = renderPanelBackdrop(panelLines, 40, 80, 24);
		expect(result).toHaveLength(24);
	});

	it("returns exactly height lines when panel is much larger than terminal", () => {
		const panelLines = Array.from({ length: 200 }, (_, i) => `line ${i}`);
		const result = renderPanelBackdrop(panelLines, 40, 80, 10);
		expect(result).toHaveLength(10);
	});

	it("returns exactly height lines for tiny terminal", () => {
		const panelLines = ["line 1", "line 2", "line 3"];
		const result = renderPanelBackdrop(panelLines, 40, 80, 3);
		expect(result).toHaveLength(3);
	});

	it("returns exactly height lines for height=1", () => {
		const panelLines = ["line 1"];
		const result = renderPanelBackdrop(panelLines, 40, 80, 1);
		expect(result).toHaveLength(1);
	});

	it("returns empty array for height=0", () => {
		const panelLines = ["line 1"];
		const result = renderPanelBackdrop(panelLines, 40, 80, 0);
		expect(result).toHaveLength(0);
	});

	it("centers panel vertically when it fits", () => {
		const panelLines = ["CONTENT"];
		const result = renderPanelBackdrop(panelLines, 40, 80, 11);
		expect(result).toHaveLength(11);
		// Panel should be in the middle area (topPad = floor((11-1)/2) = 5)
		const contentIdx = result.findIndex(l => l.includes("CONTENT"));
		expect(contentIdx).toBe(5);
	});

	it("includes all panel lines when they fit", () => {
		const panelLines = ["AAA", "BBB", "CCC"];
		const result = renderPanelBackdrop(panelLines, 40, 80, 20);
		expect(result).toHaveLength(20);
		const withContent = result.filter(l => l.includes("AAA") || l.includes("BBB") || l.includes("CCC"));
		expect(withContent).toHaveLength(3);
	});

	it("truncates panel lines when they overflow", () => {
		const panelLines = Array.from({ length: 30 }, (_, i) => `ROW-${i}`);
		const result = renderPanelBackdrop(panelLines, 40, 80, 10);
		expect(result).toHaveLength(10);
		// Should contain some ROW- lines but not all 30
		const rowLines = result.filter(l => l.includes("ROW-"));
		expect(rowLines.length).toBeLessThan(30);
		expect(rowLines.length).toBeGreaterThan(0);
	});

	it("fills dark background rows for padding", () => {
		const panelLines = ["content"];
		const result = renderPanelBackdrop(panelLines, 40, 80, 10);
		expect(result).toHaveLength(10);
		// Non-content lines should have dark background (dimBg prefix)
		const darkLines = result.filter(l => l.startsWith("\x1b[48;2;10;10;15m"));
		expect(darkLines.length).toBe(10); // all lines have dark bg
	});

	it("handles empty panelLines", () => {
		const result = renderPanelBackdrop([], 40, 80, 10);
		expect(result).toHaveLength(10);
	});
});
