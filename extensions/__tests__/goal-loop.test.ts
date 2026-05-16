// ABOUTME: Tests for GOAL loop extension tool behavior.
// ABOUTME: Verifies completion records state, clears GOAL UI, and exits GOAL mode.

import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import goalLoopExtension from "../goal-loop.ts";

function createHarness() {
	const tools = new Map<string, any>();
	const commands = new Map<string, any>();
	const handlers = new Map<string, any>();
	const pi = {
		registerTool: vi.fn((tool: any) => tools.set(tool.name, tool)),
		registerCommand: vi.fn((name: string, command: any) => commands.set(name, command)),
		on: vi.fn((event: string, handler: any) => handlers.set(event, handler)),
	};
	goalLoopExtension(pi as any);
	return { tools, commands, handlers, pi };
}

describe("goal-loop extension", () => {
	afterEach(() => {
		delete (globalThis as any).__piSetModeForApproval;
	});

	it("goal_loop_complete clears GOAL UI and switches back to NORMAL mode", async () => {
		const { tools } = createHarness();
		const cwd = mkdtempSync(join(tmpdir(), "agent-pi-goal-loop-test-"));
		const setMode = vi.fn();
		(globalThis as any).__piSetModeForApproval = setMode;
		const ctx = {
			cwd,
			hasUI: true,
			ui: { setWidget: vi.fn() },
		};

		const complete = tools.get("goal_loop_complete");
		expect(complete).toBeTruthy();
		const result = await complete.execute(
			"call-1",
			{
				goal: "Finish sample goal",
				success_condition: "Evidence is recorded",
				evidence: ["Targeted tests passed"],
				summary: "Done",
				next_steps: ["Return to normal work"],
				session_name: "sample-goal",
			},
			undefined,
			undefined,
			ctx,
		);

		expect(ctx.ui.setWidget).toHaveBeenCalledWith("goal-met", undefined);
		expect(setMode).toHaveBeenCalledWith("NORMAL", ctx);
		expect(result.content[0].text).toContain("Switched to NORMAL mode and cleared GOAL UI");

		const markdown = readFileSync(join(cwd, ".context", "goal-sessions", "sample-goal.md"), "utf-8");
		expect(markdown).toContain("## GOAL MET");
		expect(markdown).toContain("Targeted tests passed");
	});
});
