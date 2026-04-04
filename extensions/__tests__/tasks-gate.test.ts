// ABOUTME: Test suite for the tasks blocking gate bypass logic.
// ABOUTME: Validates which tools are allowed to bypass the task-definition gate.

import { describe, it, expect } from "vitest";

// This mirrors the bypass logic from tasks.ts (lines ~237-240).
// The function under test is the allowlist check extracted from the tool_call handler.
const TASK_GATE_BYPASS_TOOLS = ["tasks", "dispatch_agent", "dispatch_agents", "ask_user", "run_chain", "advance_phase", "pipeline_status"];
const READ_ONLY_BYPASS_TOOLS = ["read", "grep", "find", "ls", "glob"];

function shouldBypassTaskGate(toolName: string): boolean {
	return TASK_GATE_BYPASS_TOOLS.includes(toolName)
		|| toolName.startsWith("commander_")
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

	if (pending.length === 0) {
		return {
			block: true,
			reason: "All tasks are done. Use `tasks add` to add new tasks, `tasks new-list` to start a fresh list, or `tasks clear` to reset.",
		};
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

describe("all-done gate message includes clear option", () => {
	it("should mention tasks clear in the block reason", () => {
		const allDone: Task[] = [
			{ id: 1, text: "task one", status: "done" },
			{ id: 2, text: "task two", status: "done" },
		];
		const result = gateDecision(allDone, "bash", false);
		expect(result.block).toBe(true);
		expect(result.reason).toContain("tasks clear");
	});

	it("should mention tasks add in the block reason", () => {
		const allDone: Task[] = [{ id: 1, text: "task one", status: "done" }];
		const result = gateDecision(allDone, "bash", false);
		expect(result.reason).toContain("tasks add");
	});

	it("should mention tasks new-list in the block reason", () => {
		const allDone: Task[] = [{ id: 1, text: "task one", status: "done" }];
		const result = gateDecision(allDone, "bash", false);
		expect(result.reason).toContain("tasks new-list");
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
