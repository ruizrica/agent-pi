// ABOUTME: Shared pure helpers for final agent status/output mapping.
// ABOUTME: Keeps orchestration finalization rules testable outside Pi widgets.

import { normalizeAgentFinalOutput, type AgentOutputInput, type NormalizedAgentOutput } from "../agent-output.ts";

export interface AgentFinalizationInput extends AgentOutputInput {
	agentLabel: string;
}

export interface AgentFinalizationResult {
	status: "done" | "error";
	output: string;
	summary: string;
	normalized: NormalizedAgentOutput;
}

export function finalizeAgentOutput(input: AgentFinalizationInput): AgentFinalizationResult {
	const exitCode = input.exitCode ?? 1;
	const normalized = normalizeAgentFinalOutput({ ...input, source: input.agentLabel, exitCode });
	return {
		status: exitCode === 0 && normalized.status !== "error" ? "done" : "error",
		output: normalized.displayText,
		summary: normalized.summary || input.agentLabel,
		normalized,
	};
}
