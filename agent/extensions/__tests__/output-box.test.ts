// ABOUTME: Tests for output-box utility — outputLine, outputBox, formatToolbox
// ABOUTME: Validates bar chars, color names, and TOOLBOX format

import { describe, it, expect } from "vitest";
import { outputLine, outputBox, formatToolbox, BAR, type BarColor, type ToolCallSummary } from "../lib/output-box.ts";

function makeFakeTheme() {
	return {
		fg: (color: string, text: string) => `[${color}]${text}`,
		bold: (text: string) => `**${text}**`,
	};
}

describe("outputLine", () => {
	const theme = makeFakeTheme();

	it("includes the bar character", () => {
		const line = outputLine(theme, "accent", "hello");
		expect(line).toContain(BAR);
	});

	it("uses accent color for the bar", () => {
		const line = outputLine(theme, "accent", "hello");
		expect(line).toContain("[accent]" + BAR);
	});

	it("uses success color for the bar", () => {
		const line = outputLine(theme, "success", "hello");
		expect(line).toContain("[success]" + BAR);
	});

	it("uses error color for the bar", () => {
		const line = outputLine(theme, "error", "hello");
		expect(line).toContain("[error]" + BAR);
	});

	it("uses dim color for the bar", () => {
		const line = outputLine(theme, "dim", "hello");
		expect(line).toContain("[dim]" + BAR);
	});

	it("uses warning color for the bar", () => {
		const line = outputLine(theme, "warning", "hello");
		expect(line).toContain("[warning]" + BAR);
	});

	it("does not include ANSI bg code", () => {
		const line = outputLine(theme, "accent", "hello");
		expect(line).not.toContain("\x1b[48;2;");
	});

	it("includes the content text", () => {
		const line = outputLine(theme, "accent", "my content");
		expect(line).toContain("my content");
	});

	it("places bar before content", () => {
		const line = outputLine(theme, "accent", "hello");
		const barIdx = line.indexOf(BAR);
		const contentIdx = line.indexOf("hello");
		expect(barIdx).toBeLessThan(contentIdx);
	});
});

describe("outputBox", () => {
	const theme = makeFakeTheme();

	it("returns one line per input line", () => {
		const lines = outputBox(theme, "accent", ["line1", "line2", "line3"]);
		expect(lines).toHaveLength(3);
	});

	it("each line has the bar", () => {
		const lines = outputBox(theme, "success", ["a", "b"]);
		for (const line of lines) {
			expect(line).toContain(BAR);
		}
	});

	it("each line uses the same bar color", () => {
		const lines = outputBox(theme, "error", ["a", "b"]);
		for (const line of lines) {
			expect(line).toContain("[error]" + BAR);
		}
	});

	it("each line has no bg code", () => {
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

	it("has the bar", () => {
		const tools: ToolCallSummary[] = [{ name: "GREP", count: 1 }];
		const result = formatToolbox(theme, tools);
		expect(result).toContain(BAR);
	});

	it("uses accent bar color", () => {
		const tools: ToolCallSummary[] = [{ name: "GREP", count: 1 }];
		const result = formatToolbox(theme, tools);
		expect(result).toContain("[accent]" + BAR);
	});
});
