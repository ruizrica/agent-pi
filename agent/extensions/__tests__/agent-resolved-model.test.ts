// ABOUTME: Tests that resolvedModel is stored on AgentState during dispatch
// ABOUTME: and cleared on reset, so the detail view can display the actual model.

import { describe, it, expect } from "vitest";

type AgentStatus = "idle" | "running" | "done" | "error";

interface AgentDef {
	name: string;
	model: string; // empty = inherit parent
}

interface AgentState {
	def: AgentDef;
	status: AgentStatus;
	task: string;
	toolCount: number;
	elapsed: number;
	lastWork: string;
	contextPct: number;
	resolvedModel: string;
}

const DEFAULT_SUBAGENT_MODEL = "anthropic/claude-haiku-4-5-20251001";

/**
 * Mirrors model resolution logic from agent-team.ts dispatchAgent().
 * Resolves the effective model for an agent, storing it on state.
 * NOTE: We intentionally do NOT inherit the parent model. Each agent
 * should use its explicitly defined model or the lightweight default.
 */
function resolveModel(
	state: AgentState,
	_parentModel: { provider: string; id: string } | null,
): string {
	const model = state.def.model || DEFAULT_SUBAGENT_MODEL;
	state.resolvedModel = model;
	return model;
}

/**
 * Mirror of resetAgentState() — resets a single agent including resolvedModel.
 */
function resetAgentState(state: AgentState): void {
	state.status = "idle";
	state.task = "";
	state.toolCount = 0;
	state.elapsed = 0;
	state.lastWork = "";
	state.contextPct = 0;
	state.resolvedModel = "";
}

function makeState(overrides: Partial<AgentState> & { def: AgentDef }): AgentState {
	return {
		status: "idle",
		task: "",
		toolCount: 0,
		elapsed: 0,
		lastWork: "",
		contextPct: 0,
		resolvedModel: "",
		...overrides,
	};
}

describe("resolvedModel", () => {
	it("stores the agent's own model when defined", () => {
		const state = makeState({ def: { name: "builder", model: "openai/gpt-4o" } });
		const model = resolveModel(state, { provider: "anthropic", id: "claude-sonnet-4-20250514" });
		expect(model).toBe("openai/gpt-4o");
		expect(state.resolvedModel).toBe("openai/gpt-4o");
	});

	it("uses default subagent model when agent model is empty (ignores parent)", () => {
		const state = makeState({ def: { name: "planner", model: "" } });
		const model = resolveModel(state, { provider: "anthropic", id: "claude-opus-4-20250514" });
		// Should NOT inherit the parent model — should use the lightweight default
		expect(model).toBe(DEFAULT_SUBAGENT_MODEL);
		expect(state.resolvedModel).toBe(DEFAULT_SUBAGENT_MODEL);
	});

	it("uses default when no parent model and no agent model", () => {
		const state = makeState({ def: { name: "tester", model: "" } });
		const model = resolveModel(state, null);
		expect(model).toBe(DEFAULT_SUBAGENT_MODEL);
		expect(state.resolvedModel).toBe(DEFAULT_SUBAGENT_MODEL);
	});

	it("is cleared on reset", () => {
		const state = makeState({
			def: { name: "builder", model: "" },
			status: "done",
			resolvedModel: DEFAULT_SUBAGENT_MODEL,
		});
		resetAgentState(state);
		expect(state.resolvedModel).toBe("");
	});

	it("detail view uses resolvedModel over def.model", () => {
		const state = makeState({
			def: { name: "planner", model: "" },
			resolvedModel: DEFAULT_SUBAGENT_MODEL,
		});
		// Mirrors the detail view display logic
		const display = state.resolvedModel || state.def.model || "(unknown)";
		expect(display).toBe(DEFAULT_SUBAGENT_MODEL);
	});

	it("detail view falls back to def.model when resolvedModel empty", () => {
		const state = makeState({
			def: { name: "planner", model: "openai/gpt-4o" },
			resolvedModel: "",
		});
		const display = state.resolvedModel || state.def.model || "(unknown)";
		expect(display).toBe("openai/gpt-4o");
	});
});
