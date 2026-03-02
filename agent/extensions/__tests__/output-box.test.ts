// ABOUTME: Tests for output-box utility — outputLine, outputBox, formatToolbox
// ABOUTME: Validates plain text output formatting (no colored bars)

import { describe, it, expect } from "vitest";
import { outputLine, outputBox, formatToolbox, type ToolCallSummary } from "../lib/output-box.ts";

function makeFakeTheme() {
	return {
		fg: (color: string, text: string) => `[${color}]${text}`,
		bold: (text: string) => `**${text}**`,
	};
}

describe("outputLine", () => {
	const theme = makeFakeTheme();

	it("returns the content text", () => {
		const line = outputLine(theme, "accent", "hello");
		expect(line).toBe("hello");
	});

	it("returns content without any bar characters", () => {
		const line = outputLine(theme, "accent", "my content");
		expect(line).not.toContain("\u2588");
	});

	it("does not include ANSI bg code", () => {
		const line = outputLine(theme, "accent", "hello");
		expect(line).not.toContain("\x1b[48;2;");
	});

	it("works with all bar color types", () => {
		for (const color of ["accent", "success", "error", "dim", "warning"] as const) {
			const line = outputLine(theme, color, "test");
			expect(line).toBe("test");
		}
	});
});

describe("outputBox", () => {
	const theme = makeFakeTheme();

	it("returns one line per input line", () => {
		const lines = outputBox(theme, "accent", ["line1", "line2", "line3"]);
		expect(lines).toHaveLength(3);
	});

	it("returns lines without bar characters", () => {
		const lines = outputBox(theme, "success", ["a", "b"]);
		for (const line of lines) {
			expect(line).not.toContain("\u2588");
		}
	});

	it("preserves original content", () => {
		const lines = outputBox(theme, "error", ["first line", "second line"]);
		expect(lines[0]).toBe("first line");
		expect(lines[1]).toBe("second line");
	});

	it("has no bg code", () => {
		const lines = outputBox(theme, "accent", ["x"]);
		expect(lines[0]).not.toContain("\x1b[48;2;");
	});
});

describe("formatToolbox", () => {
	const theme = makeFakeTheme();

	it("formats a single tool", () => {
		const tools: ToolCallSummary[] = [{ name: "GREP", count: 3 }];
		const result = formatToolbox(theme, tools);
		expect(result).toContain("TOOLBOX");
		expect(result).toContain("GREP");
		expect(result).toContain("3x");
	});

	it("formats multiple tools", () => {
		const tools: ToolCallSummary[] = [
			{ name: "GREP", count: 3 },
			{ name: "READ", count: 1 },
		];
		const result = formatToolbox(theme, tools);
		expect(result).toContain("GREP");
		expect(result).toContain("READ");
		expect(result).toContain("3x");
		expect(result).toContain("1x");
	});

	it("includes hint when provided", () => {
		const tools: ToolCallSummary[] = [{ name: "READ", count: 1, hint: "config.json" }];
		const result = formatToolbox(theme, tools);
		expect(result).toContain("config.json");
	});

	it("does not include bar characters", () => {
		const tools: ToolCallSummary[] = [{ name: "GREP", count: 1 }];
		const result = formatToolbox(theme, tools);
		expect(result).not.toContain("\u2588");
	});
});
