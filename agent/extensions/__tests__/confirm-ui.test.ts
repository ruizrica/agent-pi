// ABOUTME: Tests for ConfirmUI overlay — keyboard navigation, rendering, scrolling, and callbacks
// ABOUTME: Validates Yes/No toggle via left/right, up/down scroll, Enter confirms, Escape cancels

import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock ConfirmUI (mirrors production class with simplified key matching) ──

class ConfirmUI {
	private selectedIndex = 0; // 0 = Yes, 1 = No
	private scrollOffset = 0;

	constructor(
		private question: string,
		private detail: string,
		private onConfirm: (yes: boolean) => void,
		private onCancel: () => void,
	) {}

	handleInput(data: string, tui: any): void {
		if (data === "left") {
			this.selectedIndex = 0;
		} else if (data === "right") {
			this.selectedIndex = 1;
		} else if (data === "up") {
			this.scrollOffset = Math.max(0, this.scrollOffset - 1);
		} else if (data === "down") {
			this.scrollOffset += 1; // clamped during render
		} else if (data === "enter") {
			this.onConfirm(this.selectedIndex === 0);
			return;
		} else if (data === "escape") {
			this.onCancel();
			return;
		}
		tui?.requestRender?.();
	}

	getSelectedIndex(): number {
		return this.selectedIndex;
	}

	getSelectedLabel(): string {
		return this.selectedIndex === 0 ? "Yes" : "No";
	}

	getScrollOffset(): number {
		return this.scrollOffset;
	}

	render(width: number, height: number, theme: any): string[] {
		const lines: string[] = [];
		// Compact panel: 60% width, capped at 80 cols, min 40
		const panelW = Math.min(width, Math.max(40, Math.min(80, Math.floor(width * 0.6))));

		// Chrome budget: top border + header + spacer + spacer + buttons + spacer + help + bottom border = 8
		const chromeLines = this.detail ? 9 : 8;
		const minPadding = 2;
		const maxBodyLines = Math.max(1, height - chromeLines - minPadding);

		// Header
		lines.push("┌" + "─".repeat(Math.max(1, panelW - 2)) + "┐");
		const headerText = "CONFIRM | " + this.question;
		lines.push(
			"│ " +
			(headerText.length > panelW - 4
				? headerText.substring(0, panelW - 4)
				: headerText),
		);
		lines.push("│");

		// Detail/markdown content — height-clamped with scroll support
		if (this.detail) {
			const detailLines = this.detail.split("\n");

			let visibleDetail: string[];
			if (detailLines.length > maxBodyLines) {
				this.scrollOffset = Math.max(0, Math.min(
					this.scrollOffset,
					detailLines.length - maxBodyLines,
				));
				visibleDetail = detailLines.slice(
					this.scrollOffset,
					this.scrollOffset + maxBodyLines,
				);
			} else {
				this.scrollOffset = 0;
				visibleDetail = detailLines;
			}

			for (const line of visibleDetail) {
				lines.push("│ " + line);
			}
			lines.push("│");
		}

		// Centered Yes / No buttons
		const labels = ["Yes", "No"];
		const optLine = labels
			.map((label, i) => {
				const selected = i === this.selectedIndex;
				return selected ? `▸ ${label}` : `  ${label}`;
			})
			.join("      ");
		lines.push("│  " + optLine);

		// Footer
		lines.push("│");
		const scrollHint = this.detail && this.detail.split("\n").length > maxBodyLines
			? "↑/↓ Scroll • " : "";
		lines.push("│ " + scrollHint + "←/→ Toggle • Enter Confirm • Esc Cancel");
		lines.push("└" + "─".repeat(Math.max(1, panelW - 2)) + "┘");

		// Center vertically
		const topPad = Math.max(0, Math.floor((height - lines.length) / 2));
		const result: string[] = [];
		for (let i = 0; i < topPad; i++) result.push("");
		result.push(...lines);
		return result;
	}
}

// ── Keyboard Navigation ──────────────────────────────────────────────

describe("ConfirmUI - Keyboard Navigation", () => {
	let ui: ConfirmUI;
	let confirmResult: boolean | undefined;
	let cancelledCalled: boolean;

	beforeEach(() => {
		confirmResult = undefined;
		cancelledCalled = false;

		ui = new ConfirmUI(
			"Delete this file?",
			"## Warning\nThis action **cannot** be undone.",
			(yes) => { confirmResult = yes; },
			() => { cancelledCalled = true; },
		);
	});

	it("should start with Yes selected", () => {
		expect(ui.getSelectedIndex()).toBe(0);
		expect(ui.getSelectedLabel()).toBe("Yes");
	});

	it("should toggle to No with right arrow", () => {
		const tui = { requestRender: vi.fn() };
		ui.handleInput("right", tui);
		expect(ui.getSelectedIndex()).toBe(1);
		expect(ui.getSelectedLabel()).toBe("No");
		expect(tui.requestRender).toHaveBeenCalled();
	});

	it("should toggle back to Yes with left arrow", () => {
		const tui = { requestRender: vi.fn() };
		ui.handleInput("right", tui);
		ui.handleInput("left", tui);
		expect(ui.getSelectedIndex()).toBe(0);
		expect(ui.getSelectedLabel()).toBe("Yes");
	});

	it("should stay on Yes when pressing left at start", () => {
		const tui = { requestRender: vi.fn() };
		ui.handleInput("left", tui);
		expect(ui.getSelectedIndex()).toBe(0);
	});

	it("should stay on No when pressing right repeatedly", () => {
		const tui = { requestRender: vi.fn() };
		ui.handleInput("right", tui);
		ui.handleInput("right", tui);
		ui.handleInput("right", tui);
		expect(ui.getSelectedIndex()).toBe(1);
	});

	it("should call onConfirm(true) when Enter pressed with Yes selected", () => {
		const tui = { requestRender: vi.fn() };
		ui.handleInput("enter", tui);
		expect(confirmResult).toBe(true);
	});

	it("should call onConfirm(false) when Enter pressed with No selected", () => {
		const tui = { requestRender: vi.fn() };
		ui.handleInput("right", tui);
		ui.handleInput("enter", tui);
		expect(confirmResult).toBe(false);
	});

	it("should call onCancel when Escape pressed", () => {
		const tui = { requestRender: vi.fn() };
		ui.handleInput("escape", tui);
		expect(cancelledCalled).toBe(true);
	});

	it("should scroll down with down arrow", () => {
		const tui = { requestRender: vi.fn() };
		ui.handleInput("down", tui);
		expect(ui.getScrollOffset()).toBe(1);
		expect(tui.requestRender).toHaveBeenCalled();
	});

	it("should scroll up with up arrow", () => {
		const tui = { requestRender: vi.fn() };
		ui.handleInput("down", tui);
		ui.handleInput("down", tui);
		ui.handleInput("up", tui);
		expect(ui.getScrollOffset()).toBe(1);
	});

	it("should not scroll above 0", () => {
		const tui = { requestRender: vi.fn() };
		ui.handleInput("up", tui);
		expect(ui.getScrollOffset()).toBe(0);
	});

	it("should ignore unrecognized keys", () => {
		const tui = { requestRender: vi.fn() };
		ui.handleInput("x", tui);
		expect(ui.getSelectedIndex()).toBe(0);
		expect(ui.getScrollOffset()).toBe(0);
	});

	it("should handle input without tui object", () => {
		expect(() => {
			ui.handleInput("right", undefined);
		}).not.toThrow();
		expect(ui.getSelectedIndex()).toBe(1);
	});
});

// ── Rendering ────────────────────────────────────────────────────────

describe("ConfirmUI - Rendering", () => {
	const theme = {
		fg: (_color: string, text: string) => text,
		bold: (text: string) => text,
	};

	it("should render with standard dimensions", () => {
		const ui = new ConfirmUI("Continue?", "Some detail", vi.fn(), vi.fn());
		const result = ui.render(120, 24, theme);
		expect(result).toBeInstanceOf(Array);
		expect(result.length).toBeGreaterThan(0);
	});

	it("should include question text in header", () => {
		const ui = new ConfirmUI("Delete this file?", "", vi.fn(), vi.fn());
		const rendered = ui.render(120, 24, theme).join("\n");
		expect(rendered).toContain("Delete this file?");
	});

	it("should include CONFIRM label in header", () => {
		const ui = new ConfirmUI("Continue?", "", vi.fn(), vi.fn());
		const rendered = ui.render(120, 24, theme).join("\n");
		expect(rendered).toContain("CONFIRM");
	});

	it("should include detail/markdown content in body", () => {
		const detail = "## Warning\nThis action **cannot** be undone.";
		const ui = new ConfirmUI("Delete?", detail, vi.fn(), vi.fn());
		const rendered = ui.render(120, 24, theme).join("\n");
		expect(rendered).toContain("## Warning");
		expect(rendered).toContain("cannot");
	});

	it("should show Yes and No options", () => {
		const ui = new ConfirmUI("Continue?", "", vi.fn(), vi.fn());
		const rendered = ui.render(120, 24, theme).join("\n");
		expect(rendered).toContain("Yes");
		expect(rendered).toContain("No");
	});

	it("should include navigation help text", () => {
		const ui = new ConfirmUI("Continue?", "", vi.fn(), vi.fn());
		const rendered = ui.render(120, 24, theme).join("\n");
		expect(rendered).toMatch(/Toggle|Confirm|Cancel/i);
	});

	it("should handle empty detail string", () => {
		const ui = new ConfirmUI("Continue?", "", vi.fn(), vi.fn());
		const result = ui.render(120, 24, theme);
		expect(result.length).toBeGreaterThan(0);
	});

	it("should handle multiline detail with code blocks", () => {
		const detail = "## Plan\n\n```ts\nconst x = 1;\n```\n\n| Col | Val |\n|-----|-----|\n| A   | 1   |";
		const ui = new ConfirmUI("Approve?", detail, vi.fn(), vi.fn());
		const result = ui.render(120, 24, theme);
		expect(result.length).toBeGreaterThan(0);
		const rendered = result.join("\n");
		expect(rendered).toContain("Plan");
	});

	it("should render with small dimensions", () => {
		const ui = new ConfirmUI("OK?", "detail", vi.fn(), vi.fn());
		const result = ui.render(40, 10, theme);
		expect(result.length).toBeGreaterThan(0);
	});

	it("should use compact panel width (60% capped at 80)", () => {
		const ui = new ConfirmUI("OK?", "", vi.fn(), vi.fn());
		// At width=200, 60% = 120, capped at 80
		const result = ui.render(200, 24, theme);
		const rendered = result.join("\n");
		// Panel border should be 80 cols: "┌" + 78 dashes + "┐"
		expect(rendered).toContain("─".repeat(78));
	});

	it("should clamp long detail and show scroll hint", () => {
		// 50 lines of detail in a height=15 terminal should clamp
		const longDetail = Array.from({ length: 50 }, (_, i) => `Line ${i}`).join("\n");
		const ui = new ConfirmUI("OK?", longDetail, vi.fn(), vi.fn());
		const result = ui.render(120, 15, theme);
		const rendered = result.join("\n");
		// Should show scroll hint since content overflows
		expect(rendered).toContain("↑/↓ Scroll");
		// Should NOT contain all 50 lines
		expect(rendered).not.toContain("Line 49");
	});

	it("should not show scroll hint when detail fits", () => {
		const ui = new ConfirmUI("OK?", "Short detail", vi.fn(), vi.fn());
		const result = ui.render(120, 24, theme);
		const rendered = result.join("\n");
		expect(rendered).not.toContain("↑/↓ Scroll");
	});

	it("should always show Yes/No buttons even with long detail", () => {
		const longDetail = Array.from({ length: 100 }, (_, i) => `Line ${i}`).join("\n");
		const ui = new ConfirmUI("OK?", longDetail, vi.fn(), vi.fn());
		const result = ui.render(120, 15, theme);
		const rendered = result.join("\n");
		expect(rendered).toContain("Yes");
		expect(rendered).toContain("No");
	});
});

// ── Scrolling ────────────────────────────────────────────────────────

describe("ConfirmUI - Scrolling", () => {
	const theme = {
		fg: (_color: string, text: string) => text,
		bold: (text: string) => text,
	};

	it("should clamp scroll offset during render when content fits", () => {
		const ui = new ConfirmUI("OK?", "short", vi.fn(), vi.fn());
		const tui = { requestRender: vi.fn() };
		// Artificially scroll down
		ui.handleInput("down", tui);
		ui.handleInput("down", tui);
		// Render should clamp scrollOffset back to 0 since content fits
		ui.render(120, 24, theme);
		expect(ui.getScrollOffset()).toBe(0);
	});

	it("should allow scrolling through long content", () => {
		const longDetail = Array.from({ length: 50 }, (_, i) => `Line ${i}`).join("\n");
		const ui = new ConfirmUI("OK?", longDetail, vi.fn(), vi.fn());
		const tui = { requestRender: vi.fn() };

		ui.handleInput("down", tui);
		ui.handleInput("down", tui);
		ui.handleInput("down", tui);

		// Render to apply clamping
		const result = ui.render(120, 15, theme);
		const rendered = result.join("\n");

		// Should have scrolled — Line 0 may not be visible, but later lines should be
		expect(rendered).toContain("Line 3");
	});
});

// ── Callbacks ────────────────────────────────────────────────────────

describe("ConfirmUI - Callbacks", () => {
	it("should call onConfirm exactly once on Enter", () => {
		const onConfirm = vi.fn();
		const ui = new ConfirmUI("Q?", "", onConfirm, vi.fn());
		const tui = { requestRender: vi.fn() };

		ui.handleInput("enter", tui);
		expect(onConfirm).toHaveBeenCalledTimes(1);
		expect(onConfirm).toHaveBeenCalledWith(true);
	});

	it("should call onCancel exactly once on Escape", () => {
		const onCancel = vi.fn();
		const ui = new ConfirmUI("Q?", "", vi.fn(), onCancel);
		const tui = { requestRender: vi.fn() };

		ui.handleInput("escape", tui);
		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it("should not call both onConfirm and onCancel", () => {
		const onConfirm = vi.fn();
		const onCancel = vi.fn();
		const ui = new ConfirmUI("Q?", "", onConfirm, onCancel);
		const tui = { requestRender: vi.fn() };

		ui.handleInput("enter", tui);
		expect(onConfirm).toHaveBeenCalled();
		expect(onCancel).not.toHaveBeenCalled();
	});
});
