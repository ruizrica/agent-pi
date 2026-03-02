// ABOUTME: Tests for subagent widget rendering — title format, summary, and border count
// ABOUTME: Validates ROLE - SA{id} titles, pre-written summaries, and single top divider

import { describe, it, expect } from "vitest";
import { renderSubagentWidget, subagentTitle, parseSubName, type SubRenderState } from "../lib/subagent-render.ts";

function makeFakeTheme() {
	return {
		fg: (color: string, text: string) => `[${color}]${text}`,
		bold: (text: string) => `<b>${text}</b>`,
		inverse: (text: string) => `{{${text}}}`,
	};
}

function makeState(overrides: Partial<SubRenderState> = {}): SubRenderState {
	return {
		id: 1,
		status: "done",
		name: "AGENT",
		task: "do something",
		toolCount: 3,
		elapsed: 5000,
		turnCount: 1,
		...overrides,
	};
}

describe("renderSubagentWidget", () => {
	const theme = makeFakeTheme();

	it("renders title as ROLE - SA{id}", () => {
		const state = makeState({ name: "REVIEWER" });
		const result = renderSubagentWidget(state, 80, theme);

		expect(result.lines[0]).toContain("REVIEWER - SA1");
	});

	it("uses uppercased name in title", () => {
		const state = makeState({ name: "scout" });
		const result = renderSubagentWidget(state, 80, theme);

		expect(result.lines[0]).toContain("SCOUT - SA1");
	});

	it("shows status icon in title (✓ for done, ✗ for error)", () => {
		const done = makeState({ status: "done" });
		const doneResult = renderSubagentWidget(done, 80, theme);
		expect(doneResult.lines[0]).toContain("✓");

		const error = makeState({ status: "error" });
		const errorResult = renderSubagentWidget(error, 80, theme);
		expect(errorResult.lines[0]).toContain("✗");
	});

	it("shows summary on line 2 instead of task when present", () => {
		const state = makeState({ summary: "Code quality check passed" });
		const result = renderSubagentWidget(state, 80, theme);

		// Summary replaces task on line 2; title line has no summary
		expect(result.lines[0]).not.toContain("Code quality check passed");
		expect(result.lines[1]).toContain("Code quality check passed");
	});

	it("falls back to task preview on line 2 when no summary", () => {
		const state = makeState({ summary: undefined });
		const result = renderSubagentWidget(state, 80, theme);

		// Title line + detail line = 2 lines always
		expect(result.lines).toHaveLength(2);
		expect(result.lines[1]).toContain("do something");
	});

	it("reports exactly one border (top divider only)", () => {
		const state = makeState({ summary: "check this" });
		const result = renderSubagentWidget(state, 80, theme);

		expect(result.borderCount).toBe(1);
	});

	it("shows turn label when turnCount > 1", () => {
		const state = makeState({ turnCount: 3 });
		const result = renderSubagentWidget(state, 80, theme);

		expect(result.lines[0]).toContain("Turn 3");
	});

	it("defaults name to AGENT when not specified", () => {
		const state = makeState({ name: "AGENT" });
		const result = renderSubagentWidget(state, 80, theme);

		expect(result.lines[0]).toContain("AGENT - SA1");
	});

	it("shows elapsed time and tool count", () => {
		const state = makeState({ elapsed: 12000, toolCount: 7 });
		const result = renderSubagentWidget(state, 80, theme);

		expect(result.lines[0]).toContain("12s");
		expect(result.lines[0]).toContain("Tools: 7");
	});
});

describe("subagentTitle", () => {
	it("formats as NAME - SA{id}", () => {
		expect(subagentTitle({ id: 3, name: "scout" } as SubRenderState)).toBe("SCOUT - SA3");
	});
});

describe("parseSubName", () => {
	it("extracts ALL-CAPS first word as name", () => {
		expect(parseSubName("SCOUT review the deps")).toEqual({ name: "SCOUT", task: "review the deps" });
	});

	it("defaults to AGENT when first word is not all-caps", () => {
		expect(parseSubName("review the deps")).toEqual({ name: "AGENT", task: "review the deps" });
	});

	it("handles mixed-case first word as task", () => {
		expect(parseSubName("Scout review")).toEqual({ name: "AGENT", task: "Scout review" });
	});

	it("handles single ALL-CAPS word as name with empty task", () => {
		expect(parseSubName("SCOUT")).toEqual({ name: "SCOUT", task: "" });
	});

	it("handles empty string", () => {
		expect(parseSubName("")).toEqual({ name: "AGENT", task: "" });
	});
});
