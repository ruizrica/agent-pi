// ABOUTME: Pins the contract for subagent widget auto-dismiss behavior.
// ABOUTME: Static-source assertions so future regressions surface immediately.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const widgetSource = readFileSync(
	join(__dirname, "..", "subagent-widget.ts"),
	"utf-8",
);

describe("subagent widget auto-dismiss", () => {
	it("schedules the 2-second dismiss timer and stores it on state.dismissTimer", () => {
		// The SubState interface must declare the dismissTimer slot so it's
		// trackable across the lifecycle (continue / remove / cleanup).
		expect(widgetSource).toMatch(/dismissTimer\?:\s*ReturnType<typeof setTimeout>/);

		// The finish() block must store the timer handle on the state, not just
		// fire-and-forget — that's how we make cancellation reliable.
		expect(widgetSource).toContain("state.dismissTimer = setTimeout(");
		expect(widgetSource).toMatch(/}\s*,\s*2_000\s*\);/);
	});

	it("clears the dismiss timer inside the timeout callback once it runs", () => {
		// After the timeout fires, we null out the field so subsequent reuses
		// (highly unlikely, but defensive) don't re-clear a dead handle.
		const finishBlock = widgetSource.slice(
			widgetSource.indexOf("state.dismissTimer = setTimeout("),
			widgetSource.indexOf("}, 2_000);"),
		);
		expect(finishBlock).toContain("state.dismissTimer = undefined;");
	});

	it("cancels the pending dismiss timer when subagent_continue reuses an agent", () => {
		// subagent_continue brings a finished agent back to running. If we let
		// the original 2s timer fire, it would yank the widget mid-turn.
		const continueBlock = widgetSource.slice(
			widgetSource.indexOf('name: "subagent_continue"'),
			widgetSource.indexOf('name: "subagent_remove"'),
		);
		expect(continueBlock.length).toBeGreaterThan(0);
		expect(continueBlock).toMatch(/if \(state\.dismissTimer\) \{[\s\S]*?clearTimeout\(state\.dismissTimer\)/);
	});

	it("cancels the pending dismiss timer on explicit teardown paths", () => {
		// subagent_remove, /subrm, /subclear, and subagent_cleanup all must
		// clear the timer when removing an agent — otherwise a pending
		// callback could fire against a no-longer-tracked widget id.
		const removeBlock = widgetSource.slice(
			widgetSource.indexOf('name: "subagent_remove"'),
			widgetSource.indexOf('name: "subagent_list"'),
		);
		expect(removeBlock).toContain("clearTimeout(state.dismissTimer)");

		const cleanupBlock = widgetSource.slice(
			widgetSource.indexOf('name: "subagent_cleanup"'),
			widgetSource.indexOf('registerCommand("sub"'),
		);
		expect(cleanupBlock).toContain("clearTimeout");
		expect(cleanupBlock).toContain("dismissTimer");

		// /subrm command handler
		const subrmBlock = widgetSource.slice(
			widgetSource.indexOf('registerCommand("subrm"'),
			widgetSource.indexOf('registerCommand("subclear"'),
		);
		expect(subrmBlock).toContain("clearTimeout(state.dismissTimer)");

		// /subclear command handler
		const subclearBlock = widgetSource.slice(
			widgetSource.indexOf('registerCommand("subclear"'),
			widgetSource.indexOf('pi.on("session_start"'),
		);
		expect(subclearBlock).toContain("clearTimeout(state.dismissTimer)");
	});

	it("the batch auto-cleanup loop clears dismiss timers for already-done agents", () => {
		// When a new batch starts, finished agents from the previous batch get
		// torn down immediately — we must clear any of their pending dismiss
		// timers so a stale callback doesn't run against a recycled id.
		const batchCleanupBlock = widgetSource.slice(
			widgetSource.indexOf("// ── Auto-cleanup: remove done/error agents before spawning new batch ──"),
			widgetSource.indexOf("// Build states for all agents"),
		);
		expect(batchCleanupBlock).toContain("a.dismissTimer");
		expect(batchCleanupBlock).toContain("clearTimeout(a.dismissTimer)");
	});

	it("documents the ~2s timing in the tool descriptions", () => {
		// Both subagent_create and subagent_create_batch advertise the 2s
		// behavior to the orchestrating agent. If this drifts, the prompts
		// will mislead the planner.
		const createDesc = widgetSource.match(
			/Auto-remove widget[^"]*?after done[^"]*?default: true/,
		);
		const batchDesc = widgetSource.match(
			/Auto-remove widgets[^"]*?after done[^"]*?default: true/,
		);
		expect(createDesc?.[0] ?? "").toContain("2s");
		expect(batchDesc?.[0] ?? "").toContain("2s");
	});
});
