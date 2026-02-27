// ABOUTME: Tests that agent-team resets agent states on session_switch (/new).
// ABOUTME: Validates all agents return to idle with cleared fields after reset.

import { describe, it, expect } from "vitest";

type AgentStatus = "idle" | "running" | "done" | "error";

interface AgentState {
	status: AgentStatus;
	task: string;
	toolCount: number;
	elapsed: number;
	lastWork: string;
	contextPct: number;
}

/**
 * Mirror of resetAgentState() from agent-team.ts — resets a single agent.
 */
function resetAgentState(state: AgentState): void {
	state.status = "idle";
	state.task = "";
	state.toolCount = 0;
	state.elapsed = 0;
	state.lastWork = "";
	state.contextPct = 0;
}

/**
 * Resets all agent states to idle — mirrors session_switch handler logic.
 */
function resetAgentStates(agentStates: Map<string, AgentState>): void {
	for (const state of agentStates.values()) {
		resetAgentState(state);
	}
}

describe("resetAgentStates", () => {
	it("resets running agents to idle", () => {
		const states = new Map<string, AgentState>();
		states.set("planner", {
			status: "running", task: "Plan auth", toolCount: 5,
			elapsed: 12000, lastWork: "Reading files", contextPct: 40,
		});
		resetAgentStates(states);
		expect(states.get("planner")).toEqual({
			status: "idle", task: "", toolCount: 0,
			elapsed: 0, lastWork: "", contextPct: 0,
		});
	});

	it("resets done agents to idle", () => {
		const states = new Map<string, AgentState>();
		states.set("builder", {
			status: "done", task: "Build feature", toolCount: 12,
			elapsed: 45000, lastWork: "Wrote file", contextPct: 80,
		});
		resetAgentStates(states);
		expect(states.get("builder")!.status).toBe("idle");
		expect(states.get("builder")!.task).toBe("");
	});

	it("resets error agents to idle", () => {
		const states = new Map<string, AgentState>();
		states.set("tester", {
			status: "error", task: "Run tests", toolCount: 3,
			elapsed: 5000, lastWork: "Test failed", contextPct: 20,
		});
		resetAgentStates(states);
		expect(states.get("tester")!.status).toBe("idle");
	});

	it("resets all agents in a team simultaneously", () => {
		const states = new Map<string, AgentState>();
		states.set("planner", {
			status: "done", task: "Done planning", toolCount: 8,
			elapsed: 30000, lastWork: "Finished", contextPct: 60,
		});
		states.set("builder", {
			status: "running", task: "Building", toolCount: 2,
			elapsed: 10000, lastWork: "Editing", contextPct: 30,
		});
		resetAgentStates(states);
		for (const state of states.values()) {
			expect(state.status).toBe("idle");
			expect(state.task).toBe("");
			expect(state.toolCount).toBe(0);
			expect(state.elapsed).toBe(0);
			expect(state.lastWork).toBe("");
			expect(state.contextPct).toBe(0);
		}
	});

	it("handles empty map gracefully", () => {
		const states = new Map<string, AgentState>();
		resetAgentStates(states);
		expect(states.size).toBe(0);
	});

	it("already-idle agents remain idle", () => {
		const states = new Map<string, AgentState>();
		states.set("idle-agent", {
			status: "idle", task: "", toolCount: 0,
			elapsed: 0, lastWork: "", contextPct: 0,
		});
		resetAgentStates(states);
		expect(states.get("idle-agent")!.status).toBe("idle");
	});
});
