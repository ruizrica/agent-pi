// ABOUTME: Test suite for the tasks blocking gate bypass logic.
// ABOUTME: Validates which tools are allowed to bypass the task-definition gate.

import { describe, it, expect } from "vitest";

// This mirrors the bypass logic from tasks.ts tool_call handler.
// The function under test is the allowlist check extracted from the handler.
const TASK_GATE_BYPASS_TOOLS = ["tasks", "dispatch_agent", "dispatch_agents", "ask_user", "run_chain", "advance_phase", "pipeline_status"];
const READ_ONLY_BYPASS_TOOLS = ["read", "grep", "find", "ls", "glob"];
const MODE_LIFECYCLE_TOOLS = ["set_mode", "cycle_memory", "learn_codebase", "complex_problem_loop_start", "complex_problem_loop_advance", "debug_capture"];
const UTILITY_TOOLS = ["web_remote", "safe_port_scan", "security_news", "send_email", "network_inspect", "call_tool", "tool_search"];

function shouldBypassTaskGate(toolName: string): boolean {
	return TASK_GATE_BYPASS_TOOLS.includes(toolName)
		|| toolName.startsWith("commander_")
		|| toolName.startsWith("subagent_")
		|| toolName.startsWith("show_")
		|| toolName === "close_viewer"
		|| toolName.startsWith("chrome_devtools_")
		|| toolName === "obsidian_memory"
		|| MODE_LIFECYCLE_TOOLS.includes(toolName)
		|| UTILITY_TOOLS.includes(toolName)
		|| READ_ONLY_BYPASS_TOOLS.includes(toolName);
}

describe("shouldBypassTaskGate", () => {
	it("should bypass for 'tasks' tool", () => {
		expect(shouldBypassTaskGate("tasks")).toBe(true);
	});

	it("should bypass for 'dispatch_agent' tool", () => {
		expect(shouldBypassTaskGate("dispatch_agent")).toBe(true);
	});

	it("should bypass for 'dispatch_agents' tool", () => {
		expect(shouldBypassTaskGate("dispatch_agents")).toBe(true);
	});

	it("should bypass for 'ask_user' tool (communication tool)", () => {
		expect(shouldBypassTaskGate("ask_user")).toBe(true);
	});

	it("should bypass for 'show_plan' tool used by investigate questions and approval flows", () => {
		expect(shouldBypassTaskGate("show_plan")).toBe(true);
	});

	it("should bypass for 'run_chain' tool (orchestration tool)", () => {
		expect(shouldBypassTaskGate("run_chain")).toBe(true);
	});

	it("should NOT bypass for 'bash' tool", () => {
		expect(shouldBypassTaskGate("bash")).toBe(false);
	});

	it("should NOT bypass for 'read_file' tool", () => {
		expect(shouldBypassTaskGate("read_file")).toBe(false);
	});

	it("should NOT bypass for 'write_file' tool", () => {
		expect(shouldBypassTaskGate("write_file")).toBe(false);
	});

	it("should NOT bypass for empty string", () => {
		expect(shouldBypassTaskGate("")).toBe(false);
	});

	it("should bypass for 'commander_task' tool", () => {
		expect(shouldBypassTaskGate("commander_task")).toBe(true);
	});

	it("should bypass for 'commander_session' tool", () => {
		expect(shouldBypassTaskGate("commander_session")).toBe(true);
	});

	it("should bypass for 'commander_mailbox' tool", () => {
		expect(shouldBypassTaskGate("commander_mailbox")).toBe(true);
	});

	it("should bypass for any commander_* prefixed tool", () => {
		expect(shouldBypassTaskGate("commander_workflow")).toBe(true);
		expect(shouldBypassTaskGate("commander_orchestration")).toBe(true);
		expect(shouldBypassTaskGate("commander_dependency")).toBe(true);
	});

	it("should bypass for 'advance_phase' pipeline tool", () => {
		expect(shouldBypassTaskGate("advance_phase")).toBe(true);
	});

	it("should bypass for 'pipeline_status' pipeline tool", () => {
		expect(shouldBypassTaskGate("pipeline_status")).toBe(true);
	});
});

describe("subagent tool bypass", () => {
	it("should bypass for 'subagent_create' tool", () => {
		expect(shouldBypassTaskGate("subagent_create")).toBe(true);
	});

	it("should bypass for 'subagent_create_batch' tool", () => {
		expect(shouldBypassTaskGate("subagent_create_batch")).toBe(true);
	});

	it("should bypass for 'subagent_continue' tool", () => {
		expect(shouldBypassTaskGate("subagent_continue")).toBe(true);
	});

	it("should bypass for 'subagent_remove' tool", () => {
		expect(shouldBypassTaskGate("subagent_remove")).toBe(true);
	});

	it("should bypass for 'subagent_list' tool", () => {
		expect(shouldBypassTaskGate("subagent_list")).toBe(true);
	});

	it("should bypass for 'subagent_cleanup' tool", () => {
		expect(shouldBypassTaskGate("subagent_cleanup")).toBe(true);
	});

	it("should bypass for any subagent_ prefixed tool", () => {
		expect(shouldBypassTaskGate("subagent_future_tool")).toBe(true);
	});
});

describe("viewer/UI tool bypass", () => {
	it("should bypass for 'show_plan' tool", () => {
		expect(shouldBypassTaskGate("show_plan")).toBe(true);
	});

	it("should bypass for 'show_report' tool", () => {
		expect(shouldBypassTaskGate("show_report")).toBe(true);
	});

	it("should bypass for 'show_board' tool", () => {
		expect(shouldBypassTaskGate("show_board")).toBe(true);
	});

	it("should bypass for 'show_file' tool", () => {
		expect(shouldBypassTaskGate("show_file")).toBe(true);
	});

	it("should bypass for 'show_spec' tool", () => {
		expect(shouldBypassTaskGate("show_spec")).toBe(true);
	});

	it("should bypass for 'show_chat' tool", () => {
		expect(shouldBypassTaskGate("show_chat")).toBe(true);
	});

	it("should bypass for any show_ prefixed tool", () => {
		expect(shouldBypassTaskGate("show_anything_new")).toBe(true);
	});

	it("should bypass for 'close_viewer' tool", () => {
		expect(shouldBypassTaskGate("close_viewer")).toBe(true);
	});
});

describe("mode/lifecycle tool bypass", () => {
	it("should bypass for 'set_mode' tool", () => {
		expect(shouldBypassTaskGate("set_mode")).toBe(true);
	});

	it("should bypass for 'cycle_memory' tool", () => {
		expect(shouldBypassTaskGate("cycle_memory")).toBe(true);
	});

	it("should bypass for 'learn_codebase' tool", () => {
		expect(shouldBypassTaskGate("learn_codebase")).toBe(true);
	});

	it("should bypass for 'complex_problem_loop_start' tool", () => {
		expect(shouldBypassTaskGate("complex_problem_loop_start")).toBe(true);
	});

	it("should bypass for 'complex_problem_loop_advance' tool", () => {
		expect(shouldBypassTaskGate("complex_problem_loop_advance")).toBe(true);
	});

	it("should bypass for 'debug_capture' tool", () => {
		expect(shouldBypassTaskGate("debug_capture")).toBe(true);
	});
});

describe("knowledge/utility tool bypass", () => {
	it("should bypass for 'obsidian_memory' tool", () => {
		expect(shouldBypassTaskGate("obsidian_memory")).toBe(true);
	});

	it("should bypass for 'web_remote' tool", () => {
		expect(shouldBypassTaskGate("web_remote")).toBe(true);
	});

	it("should bypass for 'send_email' tool", () => {
		expect(shouldBypassTaskGate("send_email")).toBe(true);
	});

	it("should bypass for 'call_tool' tool", () => {
		expect(shouldBypassTaskGate("call_tool")).toBe(true);
	});

	it("should bypass for 'tool_search' tool", () => {
		expect(shouldBypassTaskGate("tool_search")).toBe(true);
	});

	it("should bypass for 'chrome_devtools_mcp_connect' tool", () => {
		expect(shouldBypassTaskGate("chrome_devtools_mcp_connect")).toBe(true);
	});

	it("should bypass for any chrome_devtools_ prefixed tool", () => {
		expect(shouldBypassTaskGate("chrome_devtools_future")).toBe(true);
	});
});

describe("read-only tool bypass", () => {
	it("should bypass for 'read' tool", () => {
		expect(shouldBypassTaskGate("read")).toBe(true);
	});

	it("should bypass for 'grep' tool", () => {
		expect(shouldBypassTaskGate("grep")).toBe(true);
	});

	it("should bypass for 'find' tool", () => {
		expect(shouldBypassTaskGate("find")).toBe(true);
	});

	it("should bypass for 'ls' tool", () => {
		expect(shouldBypassTaskGate("ls")).toBe(true);
	});

	it("should bypass for 'glob' tool", () => {
		expect(shouldBypassTaskGate("glob")).toBe(true);
	});

	it("should NOT bypass for 'write' tool (write operation)", () => {
		expect(shouldBypassTaskGate("write")).toBe(false);
	});

	it("should NOT bypass for 'edit' tool (write operation)", () => {
		expect(shouldBypassTaskGate("edit")).toBe(false);
	});

	it("should NOT bypass for 'bash' tool (write operation)", () => {
		expect(shouldBypassTaskGate("bash")).toBe(false);
	});
});

// ── Gate behavior when tasks array is corrupted ────────────────────────

type TaskStatus = "idle" | "inprogress" | "done";
interface Task { id: number; text: string; status: TaskStatus }

/**
 * Mirrors the gate logic from tasks.ts tool_call handler (lines ~326-358).
 * Extracted here so we can test edge cases without the full extension harness.
 */
function gateDecision(
	tasks: Task[] | undefined | null,
	toolName: string,
	isSubagent: boolean,
): { block: boolean; reason?: string } {
	if (isSubagent) return { block: false };
	if (shouldBypassTaskGate(toolName)) return { block: false };

	// Safety: corrupted state should never block
	if (!Array.isArray(tasks)) return { block: false };

	if (tasks.length === 0) return { block: false };

	const pending = tasks.filter(t => t.status !== "done");
	const active = tasks.filter(t => t.status === "inprogress");

	// All tasks done — nudge but don't block (avoids deadlock)
	if (pending.length === 0) {
		return { block: false };
	}
	if (active.length === 0) {
		return {
			block: true,
			reason: "No task is in progress. You MUST use `tasks toggle` to mark a task as inprogress before doing any work.",
		};
	}

	return { block: false };
}

describe("gate with corrupted/undefined tasks", () => {
	it("should NOT block when tasks is undefined", () => {
		const result = gateDecision(undefined, "bash", false);
		expect(result.block).toBe(false);
	});

	it("should NOT block when tasks is null", () => {
		const result = gateDecision(null, "bash", false);
		expect(result.block).toBe(false);
	});

	it("should NOT crash when tasks is undefined (no .filter error)", () => {
		expect(() => gateDecision(undefined, "bash", false)).not.toThrow();
	});
});

describe("all-done gate behavior — nudge, don't block", () => {
	it("should NOT block when all tasks are done (avoids deadlock)", () => {
		const allDone: Task[] = [
			{ id: 1, text: "task one", status: "done" },
			{ id: 2, text: "task two", status: "done" },
		];
		const result = gateDecision(allDone, "bash", false);
		expect(result.block).toBe(false);
	});

	it("should NOT block single-task all-done list", () => {
		const allDone: Task[] = [{ id: 1, text: "task one", status: "done" }];
		const result = gateDecision(allDone, "bash", false);
		expect(result.block).toBe(false);
	});

	it("should still block when tasks exist but none are in progress", () => {
		const idleTasks: Task[] = [
			{ id: 1, text: "task one", status: "idle" },
			{ id: 2, text: "task two", status: "idle" },
		];
		const result = gateDecision(idleTasks, "bash", false);
		expect(result.block).toBe(true);
		expect(result.reason).toContain("tasks toggle");
	});
});

describe("PI_SUBAGENT env var bypass", () => {
	function shouldBypassForSubagent(): boolean {
		return process.env.PI_SUBAGENT === "1";
	}

	it("should bypass entire gate when PI_SUBAGENT=1", () => {
		const original = process.env.PI_SUBAGENT;
		process.env.PI_SUBAGENT = "1";
		expect(shouldBypassForSubagent()).toBe(true);
		if (original === undefined) delete process.env.PI_SUBAGENT;
		else process.env.PI_SUBAGENT = original;
	});

	it("should NOT bypass when PI_SUBAGENT is unset", () => {
		const original = process.env.PI_SUBAGENT;
		delete process.env.PI_SUBAGENT;
		expect(shouldBypassForSubagent()).toBe(false);
		if (original !== undefined) process.env.PI_SUBAGENT = original;
	});

	it("should NOT bypass when PI_SUBAGENT is 0", () => {
		const original = process.env.PI_SUBAGENT;
		process.env.PI_SUBAGENT = "0";
		expect(shouldBypassForSubagent()).toBe(false);
		if (original === undefined) delete process.env.PI_SUBAGENT;
		else process.env.PI_SUBAGENT = original;
	});
});
