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
	it("uses a shared 2-second dismiss constant and tracks terminal timestamps", () => {
		expect(widgetSource).toContain("const SUBAGENT_DISMISS_MS = 2_000;");
		expect(widgetSource).toContain("const SUBAGENT_SWEEP_MS");
		expect(widgetSource).toMatch(/terminalAt\?:\s*number/);
		expect(widgetSource).toMatch(/dismissTimer\?:\s*ReturnType<typeof setTimeout>/);
	});

	it("centralizes scheduling and removal through helper functions", () => {
		expect(widgetSource).toContain("function clearDismissTimer(state: SubState)");
		expect(widgetSource).toContain("function removeSubagentWidget(id: number, ctx: any, reason: string)");
		expect(widgetSource).toContain("function scheduleTerminalDismiss(state: SubState, ctx: any, reason: string)");
		expect(widgetSource).toContain("function sweepTerminalSubagents(ctx: any, reason: string)");
		expect(widgetSource).toContain("state.dismissTimer = setTimeout(");
		expect(widgetSource).toContain("}, SUBAGENT_DISMISS_MS);");
	});

	it("marks terminal states before scheduling dismissal", () => {
		const finishBlock = widgetSource.slice(
			widgetSource.indexOf("const finish ="),
			widgetSource.indexOf("resolve();", widgetSource.indexOf("const finish =")),
		);
		expect(finishBlock).toContain("state.status = code === 0 ? \"done\" : \"error\";");
		expect(finishBlock).toContain("state.terminalAt = Date.now();");
		expect(finishBlock).toContain("scheduleTerminalDismiss(state, ctx, \"finish\");");
		expect(finishBlock).not.toContain("auto_remove_skipped");
	});

	it("runs a periodic stale sweep and opportunistic input/show-tool sweeps", () => {
		expect(widgetSource).toContain("function startCleanupSweep(ctx: any)");
		expect(widgetSource).toContain("sweepTerminalSubagents(ctx, \"interval\")");
		expect(widgetSource).toContain("pi.on(\"input\"");
		expect(widgetSource).toContain("sweepTerminalSubagents(ctx, \"input\")");
		expect(widgetSource).toContain("pi.on(\"tool_call\"");
		expect(widgetSource).toContain("toolName.startsWith(\"show_\")");
		expect(widgetSource).toContain("sweepTerminalSubagents(ctx, \"show_tool\")");
	});

	it("cancels the pending dismiss timer when subagent_continue reuses an agent", () => {
		const continueBlock = widgetSource.slice(
			widgetSource.indexOf('name: "subagent_continue"'),
			widgetSource.indexOf('name: "subagent_remove"'),
		);
		expect(continueBlock.length).toBeGreaterThan(0);
		expect(continueBlock).toContain("clearDismissTimer(state);");
		expect(continueBlock).toContain("state.terminalAt = undefined;");
	});

	it("cancels the pending dismiss timer on explicit teardown paths", () => {
		const removeBlock = widgetSource.slice(
			widgetSource.indexOf('name: "subagent_remove"'),
			widgetSource.indexOf('name: "subagent_list"'),
		);
		expect(removeBlock).toContain("removeSubagentWidget(args.id, ctx, \"explicit_remove\")");

		const cleanupBlock = widgetSource.slice(
			widgetSource.indexOf('name: "subagent_cleanup"'),
			widgetSource.indexOf('registerCommand("sub"'),
		);
		expect(cleanupBlock).toContain("removeSubagentWidget(id, ctx, \"manual_cleanup_terminal\")");
		expect(cleanupBlock).toContain("clearDismissTimer(state)");

		const subrmBlock = widgetSource.slice(
			widgetSource.indexOf('registerCommand("subrm"'),
			widgetSource.indexOf('registerCommand("subclear"'),
		);
		expect(subrmBlock).toContain("removeSubagentWidget(num, ctx, \"slash_subrm\")");

		const subclearBlock = widgetSource.slice(
			widgetSource.indexOf('registerCommand("subclear"'),
			widgetSource.indexOf('pi.on("session_start"'),
		);
		expect(subclearBlock).toContain("clearDismissTimer(state)");
	});

	it("the batch auto-cleanup loop uses the shared terminal removal helper", () => {
		const batchCleanupBlock = widgetSource.slice(
			widgetSource.indexOf("// ── Auto-cleanup: remove done/error agents before spawning new batch ──"),
			widgetSource.indexOf("// Build states for all agents"),
		);
		expect(batchCleanupBlock).toContain("isTerminal(a)");
		expect(batchCleanupBlock).toContain("removeSubagentWidget(id, widgetCtx || ctx, \"batch_precleanup\")");
	});

	it("documents the ~2s timing in the tool descriptions", () => {
		const createDesc = widgetSource.match(
			/Auto-remove widget[^\"]*?after done[^\"]*?default: true/,
		);
		const batchDesc = widgetSource.match(
			/Auto-remove widgets[^\"]*?after done[^\"]*?default: true/,
		);
		expect(createDesc?.[0] ?? "").toContain("2s");
		expect(batchDesc?.[0] ?? "").toContain("2s");
	});
});
