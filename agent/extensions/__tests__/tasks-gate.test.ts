// Test suite for the tasks blocking gate bypass logic
// Validates which tools are allowed to bypass the task-definition gate

import { describe, it, expect } from "vitest";

// This mirrors the bypass logic from tasks.ts (lines ~237-240).
// The function under test is the allowlist check extracted from the tool_call handler.
const TASK_GATE_BYPASS_TOOLS = ["tasks", "dispatch_agent", "dispatch_agents", "ask_user", "run_chain"];

function shouldBypassTaskGate(toolName: string): boolean {
	return TASK_GATE_BYPASS_TOOLS.includes(toolName);
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
});
