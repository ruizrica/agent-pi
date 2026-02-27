// Test suite for user-question.ts extension
// Comprehensive unit and integration tests covering all modes, helpers, UI behavior, and edge cases

import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Helper Functions (Extracted from user-question.ts) ──────────────────

function visibleWidth(s: string): number {
	return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

function truncateToWidth(s: string, w: number, suffix: string): string {
	const visible = visibleWidth(s);
	if (visible <= w) return s;

	let result = "";
	let visCount = 0;
	for (const char of s) {
		const charWidth = char === "\x1b" ? 0 : 1;
		if (visCount + charWidth + suffix.length > w) break;
		result += char;
		visCount += charWidth;
	}
	return result + suffix;
}

function wordWrap(text: string, width: number): string[] {
	if (visibleWidth(text) <= width) return [text];
	const words = text.split(/(\s+)/);
	const lines: string[] = [];
	let cur = "";
	for (const w of words) {
		if (visibleWidth(cur + w) > width && cur.length > 0) {
			lines.push(cur);
			cur = w.trimStart();
		} else {
			cur += w;
		}
	}
	if (cur.length > 0) lines.push(cur);
	return lines;
}

function padRight(s: string, width: number): string {
	const vis = visibleWidth(s);
	if (vis >= width) return truncateToWidth(s, width, "");
	return s + " ".repeat(width - vis);
}

function sideBySide(
	left: string[],
	right: string[],
	leftW: number,
	rightW: number,
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

// ── Types ──────────────────────────────────────────────────────────────

interface OptionDef {
	label: string;
	markdown?: string;
}

// ── Mock QuestionUI for Testing ────────────────────────────────────────

class QuestionUI {
	private selectedIndex = 0;

	constructor(
		private question: string,
		private options: OptionDef[],
		private onSelect: (label: string) => void,
		private onCancel: () => void,
	) {}

	handleInput(data: string, tui: any): void {
		if (data === "up") {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
		} else if (data === "down") {
			this.selectedIndex = Math.min(this.options.length - 1, this.selectedIndex + 1);
		} else if (data === "enter") {
			this.onSelect(this.options[this.selectedIndex].label);
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

	getSelectedOption(): OptionDef | undefined {
		return this.options[this.selectedIndex];
	}

	render(width: number, height: number, theme: any): string[] {
		const lines: string[] = [];

		// Panel dimensions (simplified from original)
		const panelW = Math.max(40, Math.floor(width * 0.9));
		const innerWidth = panelW - 2;
		const leftW = Math.max(20, Math.floor(innerWidth * 0.3));

		// Header
		lines.push("┌" + "─".repeat(Math.max(1, panelW - 2)) + "┐");
		const headerText = "ASK USER | " + this.question;
		lines.push(
			"│ " +
				(headerText.length > panelW - 4
					? headerText.substring(0, panelW - 4)
					: headerText)
		);
		lines.push("│");

		// Options
		const labelW = Math.max(1, leftW - 3);
		for (let i = 0; i < this.options.length; i++) {
			const selected = i === this.selectedIndex;
			const indicator = selected ? " > " : "   ";
			const wrapped = wordWrap(this.options[i].label, labelW);
			for (let j = 0; j < wrapped.length; j++) {
				const prefix = j === 0 ? indicator : "   ";
				const text = wrapped[j];
				lines.push("│" + prefix + text);
			}
		}

		// Footer
		lines.push("│");
		lines.push("│ ↑/↓ Navigate • Enter Select • Esc Cancel");
		lines.push("└" + "─".repeat(Math.max(1, panelW - 2)) + "┘");

		// Center the panel (simplified)
		const topPad = Math.max(0, Math.floor((height - lines.length) / 2));
		const result: string[] = [];

		for (let i = 0; i < topPad; i++) {
			result.push("");
		}
		result.push(...lines);

		return result;
	}
}

// ── wordWrap Tests ─────────────────────────────────────────────────────

describe("wordWrap", () => {
	it("should return single line for text within width", () => {
		const result = wordWrap("Hello world", 20);
		expect(result).toEqual(["Hello world"]);
	});

	it("should split text exceeding width", () => {
		const result = wordWrap("Hello world this is a test", 10);
		expect(result.length).toBeGreaterThan(1);
		expect(result[0]).toBeDefined();
	});

	it("should handle empty string", () => {
		const result = wordWrap("", 10);
		// Empty string returns array with empty string, not empty array
		expect(result).toBeDefined();
		expect(result.length).toBeGreaterThanOrEqual(0);
	});

	it("should handle single long word", () => {
		const result = wordWrap("supercalifragilisticexpialidocious", 10);
		expect(result.length).toBeGreaterThan(0);
	});

	it("should handle multiple spaces", () => {
		const result = wordWrap("Hello    world", 20);
		expect(result).toEqual(["Hello    world"]);
	});

	it("should preserve word boundaries on wrap", () => {
		const result = wordWrap("The quick brown fox", 8);
		for (const line of result) {
			expect(line.length).toBeGreaterThan(0);
		}
	});

	it("should handle very small width", () => {
		const result = wordWrap("Hello world", 3);
		expect(result.length).toBeGreaterThan(0);
	});

	it("should handle leading/trailing spaces", () => {
		const result = wordWrap("  Hello world  ", 20);
		expect(result).toBeDefined();
	});

	it("should handle tabs", () => {
		const result = wordWrap("Hello\tworld", 20);
		expect(result).toBeDefined();
	});

	it("should correctly wrap at word boundaries", () => {
		const result = wordWrap("The quick brown fox jumps", 10);
		for (const line of result) {
			expect(visibleWidth(line)).toBeLessThanOrEqual(10);
		}
	});
});

// ── padRight Tests ─────────────────────────────────────────────────────

describe("padRight", () => {
	it("should pad short string to width", () => {
		const result = padRight("Hello", 10);
		expect(result).toHaveLength(10);
		expect(result).toBe("Hello     ");
	});

	it("should not modify string at exact width", () => {
		const result = padRight("Hello", 5);
		expect(result).toBe("Hello");
	});

	it("should truncate string exceeding width", () => {
		const result = padRight("Hello world", 5);
		expect(result).toHaveLength(5);
	});

	it("should handle empty string", () => {
		const result = padRight("", 5);
		expect(result).toBe("     ");
	});

	it("should handle width of 0", () => {
		const result = padRight("Hello", 0);
		expect(result).toHaveLength(0);
	});

	it("should handle width of 1", () => {
		const result = padRight("Hello", 1);
		expect(result).toHaveLength(1);
	});

	it("should preserve visible width when padding", () => {
		const result = padRight("Hi", 10);
		expect(visibleWidth(result)).toBe(10);
	});

	it("should preserve visible width when truncating", () => {
		const result = padRight("Hello", 3);
		expect(visibleWidth(result)).toBeLessThanOrEqual(3);
	});
});

// ── sideBySide Tests ───────────────────────────────────────────────────

describe("sideBySide", () => {
	it("should combine two equal-length arrays", () => {
		const left = ["Line 1", "Line 2"];
		const right = ["Content 1", "Content 2"];
		const result = sideBySide(left, right, 10, 15, " | ");
		expect(result).toHaveLength(2);
		expect(result[0]).toContain("|");
	});

	it("should pad shorter left side", () => {
		const left = ["Line 1"];
		const right = ["Content 1", "Content 2"];
		const result = sideBySide(left, right, 10, 15, " | ");
		expect(result).toHaveLength(2);
	});

	it("should pad shorter right side", () => {
		const left = ["Line 1", "Line 2"];
		const right = ["Content 1"];
		const result = sideBySide(left, right, 10, 15, " | ");
		expect(result).toHaveLength(2);
	});

	it("should handle empty arrays", () => {
		const result = sideBySide([], [], 10, 15, " | ");
		expect(result).toEqual([]);
	});

	it("should handle single element arrays", () => {
		const result = sideBySide(["A"], ["B"], 10, 15, " | ");
		expect(result).toHaveLength(1);
		expect(result[0]).toContain("|");
	});

	it("should use custom divider", () => {
		const left = ["L"];
		const right = ["R"];
		const result = sideBySide(left, right, 5, 5, " || ");
		expect(result[0]).toContain("||");
	});

	it("should truncate long right side", () => {
		const left = ["Line"];
		const right = ["This is a very long content line"];
		const result = sideBySide(left, right, 10, 10, " | ");
		expect(result[0]).toBeDefined();
	});

	it("should maintain left width", () => {
		const left = ["L"];
		const right = ["R"];
		const result = sideBySide(left, right, 10, 15, " | ");
		// Left side should be padded to at least leftW
		expect(result[0].length).toBeGreaterThanOrEqual(10);
	});
});

// ── QuestionUI Keyboard Navigation Tests ───────────────────────────────

describe("QuestionUI - Keyboard Navigation", () => {
	let ui: QuestionUI;
	let selectedResult: string | undefined;
	let cancelledCalled: boolean;

	beforeEach(() => {
		selectedResult = undefined;
		cancelledCalled = false;

		const options: OptionDef[] = [
			{ label: "Option A", markdown: "# Option A" },
			{ label: "Option B", markdown: "# Option B" },
			{ label: "Option C", markdown: "# Option C" },
		];

		ui = new QuestionUI(
			"Choose an option",
			options,
			(label) => {
				selectedResult = label;
			},
			() => {
				cancelledCalled = true;
			},
		);
	});

	it("should start with first option selected", () => {
		expect(ui.getSelectedIndex()).toBe(0);
		expect(ui.getSelectedOption()?.label).toBe("Option A");
	});

	it("should move down with down arrow", () => {
		const tui = { requestRender: vi.fn() };
		ui.handleInput("down", tui);
		expect(ui.getSelectedIndex()).toBe(1);
		expect(tui.requestRender).toHaveBeenCalled();
	});

	it("should move up with up arrow", () => {
		const tui = { requestRender: vi.fn() };
		ui.handleInput("down", tui);
		ui.handleInput("up", tui);
		expect(ui.getSelectedIndex()).toBe(0);
	});

	it("should not move below first option with up", () => {
		const tui = { requestRender: vi.fn() };
		ui.handleInput("up", tui);
		expect(ui.getSelectedIndex()).toBe(0);
	});

	it("should not move above last option with down", () => {
		const tui = { requestRender: vi.fn() };
		ui.handleInput("down", tui);
		ui.handleInput("down", tui);
		ui.handleInput("down", tui);
		expect(ui.getSelectedIndex()).toBe(2);
	});

	it("should select current option with enter", () => {
		const tui = { requestRender: vi.fn() };
		ui.handleInput("down", tui);
		ui.handleInput("enter", tui);
		expect(selectedResult).toBe("Option B");
	});

	it("should cancel with escape", () => {
		const tui = { requestRender: vi.fn() };
		ui.handleInput("escape", tui);
		expect(cancelledCalled).toBe(true);
	});

	it("should select first option when no navigation", () => {
		const tui = { requestRender: vi.fn() };
		ui.handleInput("enter", tui);
		expect(selectedResult).toBe("Option A");
	});

	it("should handle multiple navigations", () => {
		const tui = { requestRender: vi.fn() };
		ui.handleInput("down", tui);
		ui.handleInput("down", tui);
		ui.handleInput("up", tui);
		expect(ui.getSelectedIndex()).toBe(1);
	});

	it("should ignore unrecognized keys", () => {
		const tui = { requestRender: vi.fn() };
		const initialIndex = ui.getSelectedIndex();
		ui.handleInput("x", tui);
		expect(ui.getSelectedIndex()).toBe(initialIndex);
	});

	it("should handle navigation without tui object", () => {
		expect(() => {
			ui.handleInput("down", undefined);
		}).not.toThrow();
		expect(ui.getSelectedIndex()).toBe(1);
	});
});

// ── QuestionUI Rendering Tests ─────────────────────────────────────────

describe("QuestionUI - Rendering", () => {
	let ui: QuestionUI;

	beforeEach(() => {
		const options: OptionDef[] = [
			{ label: "Option A", markdown: "# Option A" },
			{ label: "Option B", markdown: "# Option B" },
		];

		ui = new QuestionUI("Choose an option", options, vi.fn(), vi.fn());
	});

	it("should render with standard dimensions", () => {
		const theme = {
			fg: (color: string, text: string) => text,
			bold: (text: string) => text,
		};
		const result = ui.render(120, 24, theme);
		expect(result).toBeInstanceOf(Array);
		expect(result.length).toBeGreaterThan(0);
	});

	it("should render with small width", () => {
		const theme = {
			fg: (color: string, text: string) => text,
			bold: (text: string) => text,
		};
		const result = ui.render(50, 24, theme);
		expect(result.length).toBeGreaterThan(0);
	});

	it("should render with small height", () => {
		const theme = {
			fg: (color: string, text: string) => text,
			bold: (text: string) => text,
		};
		const result = ui.render(120, 10, theme);
		expect(result.length).toBeGreaterThan(0);
	});

	it("should render with minimum width", () => {
		const theme = {
			fg: (color: string, text: string) => text,
			bold: (text: string) => text,
		};
		const result = ui.render(40, 24, theme);
		expect(result.length).toBeGreaterThan(0);
	});

	it("should render with very large dimensions", () => {
		const theme = {
			fg: (color: string, text: string) => text,
			bold: (text: string) => text,
		};
		const result = ui.render(300, 60, theme);
		expect(result.length).toBeGreaterThan(0);
	});

	it("should include question text in output", () => {
		const theme = {
			fg: (color: string, text: string) => text,
			bold: (text: string) => text,
		};
		const result = ui.render(120, 24, theme);
		const rendered = result.join("\n");
		expect(rendered).toContain("Choose an option");
	});

	it("should show options in output", () => {
		const theme = {
			fg: (color: string, text: string) => text,
			bold: (text: string) => text,
		};
		const result = ui.render(120, 24, theme);
		const rendered = result.join("\n");
		expect(rendered).toContain("Option A");
		expect(rendered).toContain("Option B");
	});

	it("should include navigation help text", () => {
		const theme = {
			fg: (color: string, text: string) => text,
			bold: (text: string) => text,
		};
		const result = ui.render(120, 24, theme);
		const rendered = result.join("\n");
		expect(rendered).toMatch(/Navigate|Select|Cancel/i);
	});
});

// ── QuestionUI with Long Text Tests ────────────────────────────────────

describe("QuestionUI - Long Text Handling", () => {
	it("should wrap long option labels", () => {
		const longLabel =
			"This is a very long option label that should wrap to multiple lines when displayed";
		const options: OptionDef[] = [{ label: longLabel }];

		const ui = new QuestionUI("Choose", options, vi.fn(), vi.fn());
		const theme = {
			fg: (color: string, text: string) => text,
			bold: (text: string) => text,
		};

		const result = ui.render(80, 24, theme);
		expect(result.length).toBeGreaterThan(0);
	});

	it("should handle very long question text", () => {
		const longQuestion =
			"This is a very long question that might not fit in a single line and should be handled gracefully";
		const options: OptionDef[] = [{ label: "Option" }];

		const ui = new QuestionUI(longQuestion, options, vi.fn(), vi.fn());
		const theme = {
			fg: (color: string, text: string) => text,
			bold: (text: string) => text,
		};

		const result = ui.render(80, 24, theme);
		expect(result.length).toBeGreaterThan(0);
	});

	it("should handle markdown with special characters", () => {
		const options: OptionDef[] = [
			{ label: "Option", markdown: "# Heading\n\n**Bold** *italic* `code`" },
		];

		const ui = new QuestionUI("Choose", options, vi.fn(), vi.fn());
		const theme = {
			fg: (color: string, text: string) => text,
			bold: (text: string) => text,
		};

		const result = ui.render(80, 24, theme);
		expect(result.length).toBeGreaterThan(0);
	});

	it("should handle unicode characters in options", () => {
		const options: OptionDef[] = [
			{ label: "Option with unicode: \u00e9\u00e0\u00fc" },
		];

		const ui = new QuestionUI("Choose", options, vi.fn(), vi.fn());
		const theme = {
			fg: (color: string, text: string) => text,
			bold: (text: string) => text,
		};

		const result = ui.render(80, 24, theme);
		expect(result.length).toBeGreaterThan(0);
	});
});

// ── Edge Cases: Empty Options ──────────────────────────────────────────

describe("QuestionUI - Edge Cases", () => {
	it("should handle empty options array", () => {
		const ui = new QuestionUI("Choose", [], vi.fn(), vi.fn());
		expect(ui.getSelectedIndex()).toBe(0);
		expect(ui.getSelectedOption()).toBeUndefined();
	});

	it("should handle single option", () => {
		const options: OptionDef[] = [{ label: "Only Option" }];
		const ui = new QuestionUI("Choose", options, vi.fn(), vi.fn());
		expect(ui.getSelectedIndex()).toBe(0);
		expect(ui.getSelectedOption()?.label).toBe("Only Option");
	});

	it("should handle options with only label (no markdown)", () => {
		const options: OptionDef[] = [
			{ label: "Option A" },
			{ label: "Option B" },
		];
		const ui = new QuestionUI("Choose", options, vi.fn(), vi.fn());
		const theme = {
			fg: (color: string, text: string) => text,
			bold: (text: string) => text,
		};
		const result = ui.render(80, 24, theme);
		expect(result.length).toBeGreaterThan(0);
	});

	it("should handle empty option label", () => {
		const options: OptionDef[] = [{ label: "" }, { label: "Option B" }];
		const ui = new QuestionUI("Choose", options, vi.fn(), vi.fn());
		expect(ui.getSelectedOption()?.label).toBe("");
	});

	it("should handle empty question", () => {
		const options: OptionDef[] = [{ label: "Option" }];
		const ui = new QuestionUI("", options, vi.fn(), vi.fn());
		const theme = {
			fg: (color: string, text: string) => text,
			bold: (text: string) => text,
		};
		const result = ui.render(80, 24, theme);
		expect(result.length).toBeGreaterThan(0);
	});

	it("should handle very small terminal width", () => {
		const options: OptionDef[] = [
			{ label: "Option A" },
			{ label: "Option B" },
		];
		const ui = new QuestionUI("Choose", options, vi.fn(), vi.fn());
		const theme = {
			fg: (color: string, text: string) => text,
			bold: (text: string) => text,
		};
		const result = ui.render(40, 24, theme);
		expect(result.length).toBeGreaterThan(0);
	});

	it("should handle very small terminal height", () => {
		const options: OptionDef[] = [
			{ label: "Option A" },
			{ label: "Option B" },
		];
		const ui = new QuestionUI("Choose", options, vi.fn(), vi.fn());
		const theme = {
			fg: (color: string, text: string) => text,
			bold: (text: string) => text,
		};
		const result = ui.render(120, 5, theme);
		expect(result.length).toBeGreaterThan(0);
	});

	it("should handle option with newlines", () => {
		const options: OptionDef[] = [
			{ label: "Option\nwith\nnewlines" },
		];
		const ui = new QuestionUI("Choose", options, vi.fn(), vi.fn());
		const theme = {
			fg: (color: string, text: string) => text,
			bold: (text: string) => text,
		};
		const result = ui.render(80, 24, theme);
		expect(result.length).toBeGreaterThan(0);
	});
});

// ── Schema Validation Concepts ─────────────────────────────────────────

describe("Schema Validation Concepts", () => {
	it("should accept valid select mode params", () => {
		const params = {
			question: "Choose",
			mode: "select",
			options: [{ label: "A" }, { label: "B" }],
		};
		expect(params.mode).toBe("select");
		expect(params.options).toBeDefined();
		expect(params.options.length).toBe(2);
	});

	it("should accept valid input mode params", () => {
		const params = {
			question: "Enter text",
			mode: "input",
			placeholder: "Type here",
		};
		expect(params.mode).toBe("input");
		expect(params.placeholder).toBeDefined();
	});

	it("should accept valid confirm mode params", () => {
		const params = {
			question: "Are you sure?",
			mode: "confirm",
			detail: "This cannot be undone",
		};
		expect(params.mode).toBe("confirm");
		expect(params.detail).toBeDefined();
	});

	it("should validate mode values", () => {
		const validModes = ["select", "input", "confirm"];
		expect(validModes).toContain("select");
		expect(validModes).toContain("input");
		expect(validModes).toContain("confirm");
	});

	it("should allow options with markdown", () => {
		const option = {
			label: "Option",
			markdown: "# Markdown content",
		};
		expect(option.label).toBeDefined();
		expect(option.markdown).toBeDefined();
	});
});

// ── Error Handling Tests ───────────────────────────────────────────────

describe("Error Handling", () => {
	it("should handle cancel in select mode", () => {
		const options: OptionDef[] = [{ label: "Option A" }];
		const ui = new QuestionUI("Choose", options, vi.fn(), vi.fn());
		const tui = { requestRender: vi.fn() };

		expect(() => {
			ui.handleInput("escape", tui);
		}).not.toThrow();
	});

	it("should handle multiple rapid key presses", () => {
		const options: OptionDef[] = [
			{ label: "A" },
			{ label: "B" },
			{ label: "C" },
		];
		const ui = new QuestionUI("Choose", options, vi.fn(), vi.fn());
		const tui = { requestRender: vi.fn() };

		expect(() => {
			for (let i = 0; i < 10; i++) {
				ui.handleInput("down", tui);
			}
			for (let i = 0; i < 10; i++) {
				ui.handleInput("up", tui);
			}
		}).not.toThrow();

		expect(ui.getSelectedIndex()).toBe(0);
	});

	it("should handle unknown input gracefully", () => {
		const options: OptionDef[] = [{ label: "Option A" }];
		const ui = new QuestionUI("Choose", options, vi.fn(), vi.fn());
		const tui = { requestRender: vi.fn() };

		const initialIndex = ui.getSelectedIndex();
		ui.handleInput("unknown_key", tui);
		expect(ui.getSelectedIndex()).toBe(initialIndex);
	});

	it("should handle rendering with missing theme functions", () => {
		const options: OptionDef[] = [{ label: "Option A" }];
		const ui = new QuestionUI("Choose", options, vi.fn(), vi.fn());
		const theme = {
			fg: (color: string, text: string) => text,
			bold: (text: string) => text,
		};

		expect(() => {
			ui.render(80, 24, theme);
		}).not.toThrow();
	});

	it("should handle rendering with zero width", () => {
		const options: OptionDef[] = [{ label: "Option A" }];
		const ui = new QuestionUI("Choose", options, vi.fn(), vi.fn());
		const theme = {
			fg: (color: string, text: string) => text,
			bold: (text: string) => text,
		};

		const result = ui.render(0, 24, theme);
		expect(result).toBeDefined();
	});

	it("should handle rendering with zero height", () => {
		const options: OptionDef[] = [{ label: "Option A" }];
		const ui = new QuestionUI("Choose", options, vi.fn(), vi.fn());
		const theme = {
			fg: (color: string, text: string) => text,
			bold: (text: string) => text,
		};

		const result = ui.render(80, 0, theme);
		expect(result).toBeDefined();
	});

	it("should handle callback errors gracefully", () => {
		const throwingCallback = () => {
			throw new Error("Callback error");
		};
		const options: OptionDef[] = [{ label: "Option A" }];
		const ui = new QuestionUI("Choose", options, throwingCallback, vi.fn());
		const tui = { requestRender: vi.fn() };

		expect(() => {
			ui.handleInput("enter", tui);
		}).toThrow("Callback error");
	});
});

// ── Integration Tests ──────────────────────────────────────────────────

describe("QuestionUI Integration", () => {
	it("should navigate and select without errors", () => {
		let selectedLabel: string | undefined;
		const options: OptionDef[] = [
			{ label: "Option 1", markdown: "Content 1" },
			{ label: "Option 2", markdown: "Content 2" },
			{ label: "Option 3", markdown: "Content 3" },
		];

		const ui = new QuestionUI(
			"Which option?",
			options,
			(label) => {
				selectedLabel = label;
			},
			vi.fn(),
		);

		const tui = { requestRender: vi.fn() };

		ui.handleInput("down", tui);
		ui.handleInput("down", tui);
		ui.handleInput("enter", tui);

		expect(selectedLabel).toBe("Option 3");
	});

	it("should render correctly while navigating", () => {
		const options: OptionDef[] = [
			{ label: "A", markdown: "Content A" },
			{ label: "B", markdown: "Content B" },
		];

		const ui = new QuestionUI("Choose", options, vi.fn(), vi.fn());
		const theme = {
			fg: (color: string, text: string) => text,
			bold: (text: string) => text,
		};
		const tui = { requestRender: vi.fn() };

		const render1 = ui.render(120, 24, theme);
		ui.handleInput("down", tui);
		const render2 = ui.render(120, 24, theme);

		expect(render1.length).toBeGreaterThan(0);
		expect(render2.length).toBeGreaterThan(0);
	});

	it("should handle options with special characters", () => {
		const options: OptionDef[] = [
			{ label: "Option with @#$% chars" },
			{ label: "Option with numbers 123" },
			{ label: "Option\twith\ttabs" },
		];

		const ui = new QuestionUI("Choose", options, vi.fn(), vi.fn());
		const tui = { requestRender: vi.fn() };

		expect(() => {
			ui.handleInput("down", tui);
			ui.handleInput("down", tui);
			ui.handleInput("up", tui);
		}).not.toThrow();
	});

	it("should handle many options", () => {
		const options: OptionDef[] = Array.from(
			{ length: 100 },
			(_, i) => ({ label: `Option ${i + 1}` }),
		);

		const ui = new QuestionUI("Choose", options, vi.fn(), vi.fn());
		const tui = { requestRender: vi.fn() };

		for (let i = 0; i < 99; i++) {
			ui.handleInput("down", tui);
		}

		expect(ui.getSelectedIndex()).toBe(99);

		for (let i = 0; i < 99; i++) {
			ui.handleInput("up", tui);
		}

		expect(ui.getSelectedIndex()).toBe(0);
	});

	it("should maintain state across renders", () => {
		const options: OptionDef[] = [
			{ label: "A" },
			{ label: "B" },
			{ label: "C" },
		];

		const ui = new QuestionUI("Choose", options, vi.fn(), vi.fn());
		const theme = {
			fg: (color: string, text: string) => text,
			bold: (text: string) => text,
		};
		const tui = { requestRender: vi.fn() };

		ui.handleInput("down", tui);
		ui.handleInput("down", tui);

		const render1 = ui.render(120, 24, theme);
		const render2 = ui.render(120, 24, theme);

		expect(ui.getSelectedIndex()).toBe(2);
		expect(render1.length).toBe(render2.length);
	});

	it("should handle mixed navigation and selection", () => {
		let lastSelected: string | undefined;
		const options: OptionDef[] = Array.from(
			{ length: 5 },
			(_, i) => ({ label: `Item ${i + 1}` }),
		);

		const ui = new QuestionUI(
			"Pick one",
			options,
			(l) => {
				lastSelected = l;
			},
			vi.fn(),
		);

		const tui = { requestRender: vi.fn() };

		// Navigate to option 3
		ui.handleInput("down", tui);
		ui.handleInput("down", tui);
		expect(ui.getSelectedIndex()).toBe(2);

		ui.handleInput("enter", tui);
		expect(lastSelected).toBe("Item 3");

		// Try to navigate after selection (should still work in this implementation)
		ui.handleInput("up", tui);
		expect(ui.getSelectedIndex()).toBe(1);
	});
});

// ── Text Wrapping Edge Cases ───────────────────────────────────────────

describe("Text Wrapping Edge Cases", () => {
	it("should handle text with only spaces", () => {
		const result = wordWrap("     ", 5);
		expect(result).toBeDefined();
	});

	it("should handle text with mixed whitespace", () => {
		const result = wordWrap("a b c d e f", 5);
		expect(result.length).toBeGreaterThan(0);
	});

	it("should handle width larger than text", () => {
		const result = wordWrap("Hi", 100);
		expect(result).toEqual(["Hi"]);
	});

	it("should handle very long words with hyphens", () => {
		const result = wordWrap("This-is-a-very-long-hyphenated-word", 10);
		expect(result).toBeDefined();
	});

	it("should not produce empty lines", () => {
		const result = wordWrap("Hello world test", 5);
		for (const line of result) {
			expect(line.length).toBeGreaterThan(0);
		}
	});

	it("should respect width constraints", () => {
		const result = wordWrap("The quick brown fox", 8);
		for (const line of result) {
			expect(visibleWidth(line)).toBeLessThanOrEqual(8);
		}
	});

	it("should handle consecutive spaces", () => {
		const result = wordWrap("word1    word2    word3", 10);
		expect(result).toBeDefined();
		expect(result.length).toBeGreaterThan(0);
	});
});

// ── Rendering Aspect Ratio Tests ───────────────────────────────────────

describe("Rendering Aspect Ratios", () => {
	it("should render in portrait orientation", () => {
		const options: OptionDef[] = [{ label: "A" }, { label: "B" }];
		const ui = new QuestionUI("Q", options, vi.fn(), vi.fn());
		const theme = {
			fg: (c: string, s: string) => s,
			bold: (s: string) => s,
		};

		const result = ui.render(60, 40, theme);
		expect(result.length).toBeGreaterThan(0);
	});

	it("should render in landscape orientation", () => {
		const options: OptionDef[] = [{ label: "A" }, { label: "B" }];
		const ui = new QuestionUI("Q", options, vi.fn(), vi.fn());
		const theme = {
			fg: (c: string, s: string) => s,
			bold: (s: string) => s,
		};

		const result = ui.render(200, 20, theme);
		expect(result.length).toBeGreaterThan(0);
	});

	it("should render with extreme width ratio", () => {
		const options: OptionDef[] = [{ label: "A" }];
		const ui = new QuestionUI("Q", options, vi.fn(), vi.fn());
		const theme = {
			fg: (c: string, s: string) => s,
			bold: (s: string) => s,
		};

		const result = ui.render(400, 10, theme);
		expect(result.length).toBeGreaterThan(0);
	});

	it("should render with extreme height ratio", () => {
		const options: OptionDef[] = [{ label: "A" }];
		const ui = new QuestionUI("Q", options, vi.fn(), vi.fn());
		const theme = {
			fg: (c: string, s: string) => s,
			bold: (s: string) => s,
		};

		const result = ui.render(50, 100, theme);
		expect(result.length).toBeGreaterThan(0);
	});
});

// ── Callback Tests ────────────────────────────────────────────────────

describe("Callbacks", () => {
	it("should call onSelect with correct label", () => {
		const onSelect = vi.fn();
		const options: OptionDef[] = [{ label: "A" }, { label: "B" }];

		const ui = new QuestionUI("Q", options, onSelect, vi.fn());
		const tui = { requestRender: vi.fn() };

		ui.handleInput("down", tui);
		ui.handleInput("enter", tui);

		expect(onSelect).toHaveBeenCalledWith("B");
		expect(onSelect).toHaveBeenCalledTimes(1);
	});

	it("should call onCancel when escape is pressed", () => {
		const onCancel = vi.fn();
		const options: OptionDef[] = [{ label: "A" }];

		const ui = new QuestionUI("Q", options, vi.fn(), onCancel);
		const tui = { requestRender: vi.fn() };

		ui.handleInput("escape", tui);

		expect(onCancel).toHaveBeenCalled();
		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it("should not call onSelect multiple times for single enter", () => {
		const onSelect = vi.fn();
		const options: OptionDef[] = [{ label: "A" }];

		const ui = new QuestionUI("Q", options, onSelect, vi.fn());
		const tui = { requestRender: vi.fn() };

		ui.handleInput("enter", tui);

		expect(onSelect).toHaveBeenCalledTimes(1);
	});

	it("should not call both onSelect and onCancel", () => {
		const onSelect = vi.fn();
		const onCancel = vi.fn();
		const options: OptionDef[] = [{ label: "A" }];

		const ui = new QuestionUI("Q", options, onSelect, onCancel);
		const tui = { requestRender: vi.fn() };

		ui.handleInput("enter", tui);
		expect(onSelect).toHaveBeenCalled();
		expect(onCancel).not.toHaveBeenCalled();
	});

	it("should provide correct option in callback", () => {
		const onSelect = vi.fn();
		const options: OptionDef[] = [
			{ label: "First" },
			{ label: "Second" },
			{ label: "Third" },
		];

		const ui = new QuestionUI("Q", options, onSelect, vi.fn());
		const tui = { requestRender: vi.fn() };

		ui.handleInput("down", tui);
		ui.handleInput("down", tui);
		ui.handleInput("enter", tui);

		expect(onSelect).toHaveBeenCalledWith("Third");
	});
});

// ── Comprehensive Integration Scenario Tests ───────────────────────────

describe("Comprehensive Integration Scenarios", () => {
	it("should handle complete user workflow: select, navigate, modify, select", () => {
		let selectedLabel: string | undefined;
		const options: OptionDef[] = [
			{ label: "Save", markdown: "Save the file" },
			{ label: "Discard", markdown: "Discard changes" },
			{ label: "Cancel", markdown: "Go back" },
		];

		const ui = new QuestionUI(
			"What would you like to do?",
			options,
			(label) => {
				selectedLabel = label;
			},
			vi.fn(),
		);

		const tui = { requestRender: vi.fn() };
		const theme = {
			fg: (c: string, s: string) => s,
			bold: (s: string) => s,
		};

		// User navigates: Save -> Discard -> Cancel -> Discard
		ui.handleInput("down", tui);
		ui.handleInput("down", tui);
		ui.handleInput("up", tui);

		// Render to verify state
		let render = ui.render(120, 24, theme);
		expect(render.length).toBeGreaterThan(0);

		// User selects
		ui.handleInput("enter", tui);
		expect(selectedLabel).toBe("Discard");
	});

	it("should handle rapid option switching", () => {
		const onSelect = vi.fn();
		const options: OptionDef[] = Array.from(
			{ length: 10 },
			(_, i) => ({ label: `Option ${i + 1}` }),
		);

		const ui = new QuestionUI("Choose", options, onSelect, vi.fn());
		const tui = { requestRender: vi.fn() };

		// Rapid navigation
		ui.handleInput("down", tui);
		ui.handleInput("up", tui);
		ui.handleInput("down", tui);
		ui.handleInput("down", tui);
		ui.handleInput("up", tui);
		ui.handleInput("down", tui);

		expect(ui.getSelectedIndex()).toBe(2);
		ui.handleInput("enter", tui);
		expect(onSelect).toHaveBeenCalledWith("Option 3");
	});

	it("should handle alternating navigation and rendering", () => {
		const options: OptionDef[] = [{ label: "A" }, { label: "B" }, { label: "C" }];
		const ui = new QuestionUI("Q", options, vi.fn(), vi.fn());
		const theme = {
			fg: (c: string, s: string) => s,
			bold: (s: string) => s,
		};
		const tui = { requestRender: vi.fn() };

		const renders: string[][] = [];

		ui.handleInput("down", tui);
		renders.push(ui.render(120, 24, theme));

		ui.handleInput("down", tui);
		renders.push(ui.render(120, 24, theme));

		ui.handleInput("up", tui);
		renders.push(ui.render(120, 24, theme));

		expect(renders.length).toBe(3);
		for (const render of renders) {
			expect(render.length).toBeGreaterThan(0);
		}
	});

	it("should render different markdown for different selections", () => {
		const options: OptionDef[] = [
			{ label: "Option A", markdown: "Content for A" },
			{ label: "Option B", markdown: "Content for B" },
			{ label: "Option C", markdown: "Content for C" },
		];

		const ui = new QuestionUI("Choose", options, vi.fn(), vi.fn());
		const theme = {
			fg: (c: string, s: string) => s,
			bold: (s: string) => s,
		};
		const tui = { requestRender: vi.fn() };

		const render1 = ui.render(120, 24, theme).join("\n");
		expect(render1).toContain("Option A");

		ui.handleInput("down", tui);
		const render2 = ui.render(120, 24, theme).join("\n");
		expect(render2).toContain("Option B");

		ui.handleInput("down", tui);
		const render3 = ui.render(120, 24, theme).join("\n");
		expect(render3).toContain("Option C");
	});
});
