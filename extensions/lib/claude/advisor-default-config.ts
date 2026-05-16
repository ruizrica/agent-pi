// ABOUTME: Centralized configuration for complexity-aware NORMAL mode behavior.
// ABOUTME: Defines the complex-work advisor model, preferred worker model, orchestration limits, and second-opinion policy.

export const DEFAULT_ADVISOR_MODEL = "claude-opus-4-6";
export const DEFAULT_ADVISOR_PROVIDER = "anthropic";
export const ADVISOR_MODEL = DEFAULT_ADVISOR_MODEL;
export const ADVISOR_PROVIDER = DEFAULT_ADVISOR_PROVIDER;

export const PREFERRED_WORKER_MODEL = "grok-4.1-fast";
export const PREFERRED_WORKER_PROVIDER = "x-ai";

export const FALLBACK_WORKER_MODEL = "claude-haiku-4-5";
export const FALLBACK_WORKER_PROVIDER = "anthropic";

export const MAX_WORKER_AGENTS = 16;

export const SECOND_OPINION_ROLE = "red-team";
export const SECOND_OPINION_FALLBACK_ROLE = "reviewer";
export const SECOND_OPINION_MODEL = "gpt-5.4";
export const SECOND_OPINION_PROVIDER = "openai-codex";

export const SECOND_OPINION_TRIGGERS = {
	architecturalImpact: true,
	security: true,
	dataModeling: true,
	ambiguity: true,
	integration: true,
	compliance: true,
};

export interface AdvisorOrchestrationPolicy {
	advisorModel: string;
	advisorProvider: string;
	preferredWorkerModel: string;
	preferredWorkerProvider: string;
	maxWorkers: number;
	secondOpinionRole: string;
	secondOpinionModel: string;
	secondOpinionProvider: string;
}

export function buildModelIdentifier(provider: string, model: string): string {
	return provider ? `${provider}/${model}` : model;
}

export function getAdvisorModelId(): string {
	return buildModelIdentifier(DEFAULT_ADVISOR_PROVIDER, DEFAULT_ADVISOR_MODEL);
}

export function getPreferredWorkerModelId(): string {
	return buildModelIdentifier(PREFERRED_WORKER_PROVIDER, PREFERRED_WORKER_MODEL);
}

export function getFallbackWorkerModelId(): string {
	return buildModelIdentifier(FALLBACK_WORKER_PROVIDER, FALLBACK_WORKER_MODEL);
}

export function getSecondOpinionModelId(): string {
	return buildModelIdentifier(SECOND_OPINION_PROVIDER, SECOND_OPINION_MODEL);
}

export function describeWorkerModelPreference(): string {
	return `Prefers ${getPreferredWorkerModelId()} for fast worker execution, with fallback to ${getFallbackWorkerModelId()} when unavailable.`;
}

export function describeSecondOpinionAgents(): string {
	return `For complex work, request a second opinion from ${SECOND_OPINION_ROLE} or ${SECOND_OPINION_FALLBACK_ROLE} using ${getSecondOpinionModelId()}.`;
}

export function getAdvisorOrchestrationPolicy(): AdvisorOrchestrationPolicy {
	return {
		advisorModel: ADVISOR_MODEL,
		advisorProvider: ADVISOR_PROVIDER,
		preferredWorkerModel: PREFERRED_WORKER_MODEL,
		preferredWorkerProvider: PREFERRED_WORKER_PROVIDER,
		maxWorkers: MAX_WORKER_AGENTS,
		secondOpinionRole: SECOND_OPINION_ROLE,
		secondOpinionModel: SECOND_OPINION_MODEL,
		secondOpinionProvider: SECOND_OPINION_PROVIDER,
	};
}
