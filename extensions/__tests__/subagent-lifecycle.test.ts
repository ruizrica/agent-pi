// ABOUTME: Tests for subagent lifecycle management — timeout, cleanup, batch guard, render warnings
// ABOUTME: Validates watchdog timeout resolution, stale cleanup, and duplicate batch prevention

import { describe, it, expect } from "vitest";
import { renderSubagentWidget, type SubRenderState } from "../lib/subagent-render.ts";

// ── Timeout resolution tests ─────────────────────────────────────────────────
// We can't import resolveTimeout directly (it's a module-scoped function inside
// the extension default export), so we test the behavior via the render output
// and validate the constants match our expectations.

describe("timeout render warnings", () => {
	function makeFakeTheme() {
		return {
			fg: (color: string, text: string) => `[${color}]${text}`,
			bold: (text: string) => `<b>${text}</b>`,
		};
	}

	function makeState(overrides: Partial<SubRenderState> = {}): SubRenderState {
		return {
			id: 1,
			status: "running",
			name: "SCOUT",
			task: "investigate codebase",
			toolCount: 5,
			elapsed: 0,
			turnCount: 1,
			maxDurationMs: 600_000, // 10 min
			...overrides,
		};
	}

	const theme = makeFakeTheme();

	it("shows no timeout warning when elapsed is below 80% of maxDuration", () => {
		const state = makeState({ elapsed: 400_000 }); // 6.7 min = 67%
		const result = renderSubagentWidget(state, 120, theme);
		expect(result.lines[0]).not.toContain("TIMING OUT");
		expect(result.lines[0]).not.toContain("left");
	});

	it("shows 'seconds left' warning when elapsed is between 80-95% of maxDuration", () => {
		const state = makeState({ elapsed: 510_000 }); // 8.5 min = 85%
		const result = renderSubagentWidget(state, 120, theme);
		expect(result.lines[0]).toContain("left");
		expect(result.lines[0]).toContain("90s left"); // 600-510 = 90s
	});

	it("shows TIMING OUT when elapsed is >= 95% of maxDuration", () => {
		const state = makeState({ elapsed: 580_000 }); // 9.67 min = 96.7%
		const result = renderSubagentWidget(state, 120, theme);
		expect(result.lines[0]).toContain("TIMING OUT");
	});

	it("shows no timeout warning when maxDurationMs is 0 (disabled)", () => {
		const state = makeState({ elapsed: 999_000, maxDurationMs: 0 });
		const result = renderSubagentWidget(state, 120, theme);
		expect(result.lines[0]).not.toContain("TIMING OUT");
		expect(result.lines[0]).not.toContain("left");
	});

	it("shows no timeout warning when maxDurationMs is undefined", () => {
		const state = makeState({ elapsed: 999_000, maxDurationMs: undefined });
		const result = renderSubagentWidget(state, 120, theme);
		expect(result.lines[0]).not.toContain("TIMING OUT");
		expect(result.lines[0]).not.toContain("left");
	});

	it("shows no timeout warning for done agents even with elapsed > maxDuration", () => {
		const state = makeState({ status: "done", elapsed: 700_000 });
		const result = renderSubagentWidget(state, 120, theme);
		expect(result.lines[0]).not.toContain("TIMING OUT");
		expect(result.lines[0]).not.toContain("left");
	});

	it("shows no timeout warning for error agents", () => {
		const state = makeState({ status: "error", elapsed: 700_000 });
		const result = renderSubagentWidget(state, 120, theme);
		expect(result.lines[0]).not.toContain("TIMING OUT");
		expect(result.lines[0]).not.toContain("left");
	});

	it("correctly calculates remaining seconds at 80% threshold boundary", () => {
		const state = makeState({ elapsed: 480_000 }); // exactly 80%
		const result = renderSubagentWidget(state, 120, theme);
		expect(result.lines[0]).toContain("120s left"); // 600-480 = 120s
	});

	it("correctly calculates remaining seconds at 95% threshold boundary", () => {
		const state = makeState({ elapsed: 570_000 }); // exactly 95%
		const result = renderSubagentWidget(state, 120, theme);
		expect(result.lines[0]).toContain("TIMING OUT");
	});
});

describe("PLAN prompt lifecycle guidance", () => {
	// Import the PLAN_PROMPT to verify lifecycle content is present
	it("includes scout lifecycle management section", async () => {
		const { PLAN_PROMPT } = await import("../lib/mode-prompts.ts");
		expect(PLAN_PROMPT).toContain("Scout lifecycle management");
	});

	it("mentions the 10-minute timeout for scouts", async () => {
		const { PLAN_PROMPT } = await import("../lib/mode-prompts.ts");
		expect(PLAN_PROMPT).toContain("10-minute timeout");
	});

	it("mentions auto-dismiss behavior", async () => {
		const { PLAN_PROMPT } = await import("../lib/mode-prompts.ts");
		expect(PLAN_PROMPT).toContain("auto-dismiss");
	});

	it("mentions subagent_cleanup tool", async () => {
		const { PLAN_PROMPT } = await import("../lib/mode-prompts.ts");
		expect(PLAN_PROMPT).toContain("subagent_cleanup");
	});

	it("warns against spawning while previous scouts are running", async () => {
		const { PLAN_PROMPT } = await import("../lib/mode-prompts.ts");
		expect(PLAN_PROMPT).toContain("cannot spawn a new batch");
	});

	it("rules section includes wait-for-scouts guidance", async () => {
		const { PLAN_PROMPT } = await import("../lib/mode-prompts.ts");
		expect(PLAN_PROMPT).toContain("ALWAYS wait for all scouts to finish before spawning new ones");
	});

	it("rules section includes subagent_list check guidance", async () => {
		const { PLAN_PROMPT } = await import("../lib/mode-prompts.ts");
		expect(PLAN_PROMPT).toContain("subagent_list");
	});
});
