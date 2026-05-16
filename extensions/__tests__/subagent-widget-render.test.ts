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

	it("does not append task-list or hotkey UI inside the subagent widget", () => {
		const state = makeState({ status: "running", summary: "Standing by..." });
		const result = renderSubagentWidget(state, 80, theme);

		expect(result.lines).toHaveLength(2);
		expect(result.lines.join("\n")).not.toContain("Ctrl+Alt+T");
		expect(result.lines.join("\n")).not.toContain("remaining");
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

	it("shows elapsed time and tool count for standard agents", () => {
		const state = makeState({ elapsed: 12000, toolCount: 7 });
		const result = renderSubagentWidget(state, 80, theme);

		expect(result.lines[0]).toContain("12s");
		expect(result.lines[0]).toContain("Tools: 7");
	});

	it("omits the tool-count segment when the count is zero", () => {
		const state = makeState({ elapsed: 12000, toolCount: 0, model: "anthropic/claude-haiku-4-5-20251001" });
		const result = renderSubagentWidget(state, 80, theme);

		expect(result.lines[0]).toContain("12s");
		expect(result.lines[0]).not.toContain("Tools: 0");
		expect(result.lines[0]).toContain("anthropic/claude-haiku-4-5-20251001");
	});

	it("shows model as last component when present for standard agents", () => {
		const state = makeState({ model: "x-ai/grok-4.1-fast" });
		const result = renderSubagentWidget(state, 80, theme);

		expect(result.lines[0]).toContain("| x-ai/grok-4.1-fast");
	});

	it("omits model suffix when model is undefined", () => {
		const state = makeState({ model: undefined });
		const result = renderSubagentWidget(state, 80, theme);

		// Should end with Tools count, no trailing pipe
		const line = result.lines[0];
		const toolsIdx = line.indexOf("Tools:");
		const afterTools = line.slice(toolsIdx);
		expect(afterTools).not.toContain("|");
	});

	it("hides tool count and model for external toolkit workers", () => {
		const state = makeState({
			name: "cursor-worker",
			elapsed: 12000,
			toolCount: 7,
			model: "anthropic/claude-haiku-4-5-20251001",
		});
		const result = renderSubagentWidget(state, 80, theme);

		expect(result.lines[0]).toContain("12s");
		expect(result.lines[0]).not.toContain("Tools:");
		expect(result.lines[0]).not.toContain("anthropic/claude-haiku-4-5-20251001");
	});

	it("hides metadata for legacy toolkit aliases too", () => {
		const state = makeState({
			name: "codex-agent",
			toolCount: 4,
			model: "anthropic/claude-haiku-4-5-20251001",
		});
		const result = renderSubagentWidget(state, 80, theme);

		expect(result.lines[0]).not.toContain("Tools:");
		expect(result.lines[0]).not.toContain("anthropic/claude-haiku-4-5-20251001");
		expect(result.lines).toHaveLength(2);
	});

	it("keeps newer CLI agent families on the compact two-line animated cell", () => {
		for (const name of ["qwen-agent", "groq-agent", "crush-agent", "opencode-agent"]) {
			const state = makeState({
				name,
				task: "stream console-like output into widget preview",
				summary: "stream console-like output into widget preview",
				toolCount: 4,
				model: "anthropic/claude-haiku-4-5-20251001",
			});
			const result = renderSubagentWidget(state, 80, theme);

			expect(result.lines[0]).toContain(name.toUpperCase());
			expect(result.lines).toHaveLength(2);
			expect(result.lines[1]).toContain("...");
		}
	});

	it("preserves metadata for Claude roles", () => {
		const state = makeState({
			name: "claude-worker",
			toolCount: 2,
			model: "anthropic/claude-haiku-4-5",
		});
		const result = renderSubagentWidget(state, 80, theme);

		expect(result.lines[0]).toContain("Tools: 2");
		expect(result.lines[0]).toContain("anthropic/claude-haiku-4-5");
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
