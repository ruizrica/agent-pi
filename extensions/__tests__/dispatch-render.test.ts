// ABOUTME: Tests for dispatch_agent renderResult redesign — subagent-style box rendering
// ABOUTME: Validates that dispatching box uses renderSubagentWidget with correct state mapping

import { describe, it, expect } from "vitest";
import { renderSubagentWidget, type SubRenderState } from "../lib/subagent-render.ts";

function makeFakeTheme() {
	return {
		fg: (color: string, text: string) => `[${color}]${text}`,
		bold: (text: string) => `<b>${text}</b>`,
		inverse: (text: string) => `{{${text}}}`,
	};
}

/**
 * Mirrors the status mapping logic from agent-team.ts renderResult.
 * Maps dispatch details.status → SubRenderState.status.
 */
function mapStatus(s: string): "running" | "done" | "error" {
	if (s === "done") return "done";
	if (s === "dispatching") return "running";
	if (s === "error") return "error";
	return "running";
}

/**
 * Mirrors the SubRenderState construction from agent-team.ts renderResult.
 * Builds the exact render state that the dispatching box passes to renderSubagentWidget.
 */
function buildDispatchRenderState(details: {
	agent?: string;
	task?: string;
	status?: string;
	elapsed?: number;
	model?: string;
}): SubRenderState {
	return {
		id: 0,
		status: mapStatus(details.status || "dispatching"),
		name: (details.agent || "?").toUpperCase(),
		task: details.task || "",
		toolCount: 0,
		elapsed: typeof details.elapsed === "number" ? details.elapsed : 0,
		turnCount: 1,
		summary: details.task || undefined,
		model: details.model || undefined,
	};
}

describe("dispatch renderResult — status mapping", () => {
	it("maps 'dispatching' to 'running'", () => {
		expect(mapStatus("dispatching")).toBe("running");
	});

	it("maps 'done' to 'done'", () => {
		expect(mapStatus("done")).toBe("done");
	});

	it("maps 'error' to 'error'", () => {
		expect(mapStatus("error")).toBe("error");
	});

	it("maps unknown status to 'running'", () => {
		expect(mapStatus("pending")).toBe("running");
		expect(mapStatus("")).toBe("running");
	});
});

describe("dispatch renderResult — SubRenderState construction", () => {
	it("uppercases agent name", () => {
		const state = buildDispatchRenderState({ agent: "scout" });
		expect(state.name).toBe("SCOUT");
	});

	it("defaults agent name to '?' when missing", () => {
		const state = buildDispatchRenderState({});
		expect(state.name).toBe("?");
	});

	it("sets id to 0 (dispatched agents are not subagents)", () => {
		const state = buildDispatchRenderState({ agent: "builder" });
		expect(state.id).toBe(0);
	});

	it("passes model through when present", () => {
		const state = buildDispatchRenderState({ agent: "scout", model: "x-ai/grok-4.1-fast" });
		expect(state.model).toBe("x-ai/grok-4.1-fast");
	});

	it("sets model to undefined when not present", () => {
		const state = buildDispatchRenderState({ agent: "scout" });
		expect(state.model).toBeUndefined();
	});

	it("uses task as summary fallback", () => {
		const state = buildDispatchRenderState({ task: "Find the bug in auth.ts" });
		expect(state.summary).toBe("Find the bug in auth.ts");
	});

	it("sets turnCount to 1 always", () => {
		const state = buildDispatchRenderState({ agent: "reviewer" });
		expect(state.turnCount).toBe(1);
	});

	it("sets toolCount to 0", () => {
		const state = buildDispatchRenderState({ agent: "builder" });
		expect(state.toolCount).toBe(0);
	});
});

describe("dispatch renderResult — rendered output via renderSubagentWidget", () => {
	const theme = makeFakeTheme();

	it("renders dispatching (running) state with agent name and spinner", () => {
		const state = buildDispatchRenderState({
			agent: "scout",
			task: "Explore the codebase",
			status: "dispatching",
			model: "x-ai/grok-4.1-fast",
		});
		const result = renderSubagentWidget(state, 100, theme);

		// Line 1: spinner + SCOUT - SA0 + stats + model
		expect(result.lines[0]).toContain("SCOUT - SA0");
		expect(result.lines[0]).toContain("x-ai/grok-4.1-fast");
		// Line 2: task summary
		expect(result.lines[1]).toContain("Explore the codebase");
		expect(result.lines).toHaveLength(2);
	});

	it("renders done state with checkmark", () => {
		const state = buildDispatchRenderState({
			agent: "builder",
			task: "Fix the login page",
			status: "done",
			elapsed: 45000,
			model: "anthropic/claude-haiku-4-5",
		});
		const result = renderSubagentWidget(state, 100, theme);

		expect(result.lines[0]).toContain("✓");
		expect(result.lines[0]).toContain("BUILDER - SA0");
		expect(result.lines[0]).toContain("45s");
		expect(result.lines[0]).toContain("anthropic/claude-haiku-4-5");
	});

	it("renders error state with ✗", () => {
		const state = buildDispatchRenderState({
			agent: "tester",
			task: "Run integration tests",
			status: "error",
			elapsed: 12000,
		});
		const result = renderSubagentWidget(state, 100, theme);

		expect(result.lines[0]).toContain("✗");
		expect(result.lines[0]).toContain("TESTER - SA0");
		expect(result.lines[0]).toContain("12s");
	});

	it("renders without model when not provided", () => {
		const state = buildDispatchRenderState({
			agent: "reviewer",
			task: "Code review",
			status: "done",
			elapsed: 30000,
		});
		const result = renderSubagentWidget(state, 100, theme);

		expect(result.lines[0]).toContain("REVIEWER - SA0");
		expect(result.lines[0]).toContain("30s");
		// No model suffix — line should end after Tools count
		const line = result.lines[0];
		const toolsIdx = line.indexOf("Tools:");
		const afterTools = line.slice(toolsIdx);
		expect(afterTools).not.toContain("|");
	});

	it("truncates long task summary on line 2", () => {
		const longTask = "This is a very long task description that should be truncated to fit within the widget";
		const state = buildDispatchRenderState({
			agent: "planner",
			task: longTask,
			status: "dispatching",
		});
		// Narrow width forces truncation now that the preview is width-aware.
		const result = renderSubagentWidget(state, 40, theme);

		// Line 2 should be truncated to fit the available widget width.
		expect(result.lines[1]).toContain("...");
		expect(result.lines[1].length).toBeLessThan(longTask.length);
	});

	it("uses available width and does not truncate when the summary fits", () => {
		const task = "Trace mount/view + project + tombstone reconciliation";
		const state = buildDispatchRenderState({
			agent: "scout",
			task,
			status: "dispatching",
		});
		// Wide width leaves ample room, so the full summary should render.
		const result = renderSubagentWidget(state, 120, theme);

		expect(result.lines[1]).toContain(task);
		expect(result.lines[1]).not.toContain("...");
	});

	it("does not show turn label (turnCount is always 1 for dispatch)", () => {
		const state = buildDispatchRenderState({
			agent: "scout",
			task: "Find files",
			status: "done",
			elapsed: 5000,
		});
		const result = renderSubagentWidget(state, 100, theme);

		expect(result.lines[0]).not.toContain("Turn");
	});
});
