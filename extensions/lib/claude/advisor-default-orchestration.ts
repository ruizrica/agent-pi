// ABOUTME: Orchestration policy and helper logic for complexity-aware NORMAL mode.
// ABOUTME: Defines when to spawn worker agents, when to request second opinions, and fan-out caps.

import {
	MAX_WORKER_AGENTS,
	SECOND_OPINION_ROLE,
	SECOND_OPINION_FALLBACK_ROLE,
	DEFAULT_ADVISOR_MODEL,
	SECOND_OPINION_MODEL,
	SECOND_OPINION_PROVIDER,
} from "./advisor-default-config.ts";

export type AgentRolePreference = "worker" | "builder";

export interface CrossProviderSecondOpinionTarget {
	provider: string;
	model: string;
	role: string;
	reason: string;
}

/**
 * Complexity assessment for a given task/problem.
 * Used to determine fan-out strategy and whether a second opinion is needed.
 */
export enum TaskComplexity {
	/**
	 * Simple task: single file, single component, straightforward logic.
	 * No worker spawning needed. No second opinion needed.
	 */
	SIMPLE = "simple",

	/**
	 * Medium task: multiple files, moderate scope, some coordination needed.
	 * May spawn 2-4 workers if the task has parallelizable sub-tasks.
	 * No advisor or second opinion required by default; escalate only after reclassifying as complex.
	 */
	MEDIUM = "medium",

	/**
	 * Complex task: multiple subsystems, significant scope, high risk.
	 * May spawn 4-8 workers. Second opinion recommended for architectural or risky decisions.
	 */
	COMPLEX = "complex",

	/**
	 * Critical task: system-wide impact, critical path, high stakes.
	 * May spawn up to 8 workers. Second opinion strongly recommended.
	 * Consider backup/rollback plans.
	 */
	CRITICAL = "critical",
}

/**
 * Second-opinion decision for a task.
 * Determines whether a high-level reviewer should be consulted.
 */
export interface SecondOpinionDecision {
	/**
	 * Whether a second opinion is recommended.
	 */
	recommended: boolean;

	/**
	 * Reason for the decision.
	 */
	reason: string;

	/**
	 * Suggested role for the reviewer (e.g., "red-team", "reviewer").
	 */
	role: string;

	/**
	 * Suggested complexity threshold that triggered the recommendation.
	 */
	complexityThreshold: TaskComplexity;
}

/**
 * Worker fan-out decision for a task.
 * Determines how many workers to spawn and for what reason.
 */
export interface WorkerFanOutDecision {
	/**
	 * Number of non-advisor agents recommended. 0 = do the work directly, no subagent spawning.
	 */
	recommendedWorkerCount: number;

	/**
	 * Reason for the recommendation.
	 */
	reason: string;

	/**
	 * The assessed complexity level.
	 */
	complexity: TaskComplexity;

	/**
	 * Whether parallelism is possible for this task.
	 */
	isParallelizable: boolean;

	/**
	 * Preferred role for content gathering or early fanout slices.
	 */
	preferredGatheringRole: AgentRolePreference;
}

/**
 * Assess complexity from task hints and return a structured decision for worker fan-out.
 *
 * Hints: keywords, file counts, system scope indicators.
 * Returns a decision with recommended worker count (0 = no spawn, 1-8 = spawn this many).
 */
export function assessWorkerFanOut(complexity: TaskComplexity, isParallelizable: boolean): WorkerFanOutDecision {
	if (complexity === TaskComplexity.SIMPLE) {
		return {
			recommendedWorkerCount: 0,
			reason: "Simple task — execute directly",
			complexity,
			isParallelizable: false,
			preferredGatheringRole: "worker",
		};
	}

	if (complexity === TaskComplexity.MEDIUM) {
		if (isParallelizable) {
			return {
				recommendedWorkerCount: 4,
				reason: "Medium complexity with parallelizable work — spawn a small mixed pool with workers preferred for gathering",
				complexity,
				isParallelizable: true,
				preferredGatheringRole: "worker",
			};
		} else {
			return {
				recommendedWorkerCount: 0,
				reason: "Medium complexity but sequential — execute directly",
				complexity,
				isParallelizable: false,
				preferredGatheringRole: "worker",
			};
		}
	}

	if (complexity === TaskComplexity.COMPLEX) {
		if (isParallelizable) {
			return {
				recommendedWorkerCount: 8,
				reason: "Complex parallelizable work — spawn a larger mixed pool with workers leading gathering and builders handling execution-heavy slices",
				complexity,
				isParallelizable: true,
				preferredGatheringRole: "worker",
			};
		} else {
			return {
				recommendedWorkerCount: 1,
				reason: "Complex but sequential — consider a single focused worker or work directly",
				complexity,
				isParallelizable: false,
				preferredGatheringRole: "worker",
			};
		}
	}

	// CRITICAL
	if (isParallelizable) {
		return {
			recommendedWorkerCount: MAX_WORKER_AGENTS,
			reason: `Critical impact with parallelizable work — spawn up to ${MAX_WORKER_AGENTS} non-advisor agents, with workers preferred for gathering, and consider second opinion`,
			complexity,
			isParallelizable: true,
			preferredGatheringRole: "worker",
		};
	} else {
		return {
			recommendedWorkerCount: 1,
			reason: `Critical sequential work — consider single focused worker and request second opinion`,
			complexity,
			isParallelizable: false,
			preferredGatheringRole: "worker",
		};
	}
}

/**
 * Assess whether a second opinion is recommended based on task properties.
 *
 * A second opinion is recommended when:
 * - Complexity is COMPLEX or higher
 * - The work is risky, ambiguous, architectural, or critical enough to be treated as complex
 *
 * Simple and medium tasks do not automatically trigger advisor or second-opinion review.
 * If a medium task becomes risky/ambiguous enough to need review, classify it as COMPLEX first.
 */
export function assessSecondOpinion(
	complexity: TaskComplexity,
	options?: {
		isArchitectural?: boolean;
		isRisky?: boolean;
		isAmbiguous?: boolean;
		affectsCriticalPath?: boolean;
	},
): SecondOpinionDecision {
	const opts = options || {};

	// Simple tasks never need a second opinion
	if (complexity === TaskComplexity.SIMPLE) {
		return {
			recommended: false,
			reason: "Simple task — no second opinion needed",
			role: SECOND_OPINION_ROLE,
			complexityThreshold: TaskComplexity.SIMPLE,
		};
	}

	// Medium tasks do not require advisor or second-opinion review.
	// If risk/ambiguity/architecture makes review necessary, the task should be classified as COMPLEX.
	if (complexity === TaskComplexity.MEDIUM) {
		return {
			recommended: false,
			reason: opts.isArchitectural || opts.isRisky || opts.isAmbiguous || opts.affectsCriticalPath
				? "Medium task with escalation signals — reclassify as complex before requesting a second opinion"
				: "Medium complexity work — no second opinion needed",
			role: SECOND_OPINION_ROLE,
			complexityThreshold: TaskComplexity.MEDIUM,
		};
	}

	// Complex and above: recommend review
	return {
		recommended: true,
		reason: `${complexity} task — request ${SECOND_OPINION_ROLE} or ${SECOND_OPINION_FALLBACK_ROLE} review`,
		role: SECOND_OPINION_ROLE,
		complexityThreshold: complexity,
	};
}

/**
 * Get a role name for the second-opinion agent.
 * Returns the primary role, with a fallback if that role is unavailable.
 */
export function getSecondOpinionRole(useFallback?: boolean): string {
	return useFallback ? SECOND_OPINION_FALLBACK_ROLE : SECOND_OPINION_ROLE;
}

function normalizeSelectedModel(model?: string | null): string {
	return (model || "").trim().toLowerCase();
}

function classifyProviderFamily(selectedModel?: string | null): "anthropic" | "gpt" | "other" {
	const value = normalizeSelectedModel(selectedModel);
	if (!value) return "other";
	if (value.includes("anthropic") || value.includes("claude") || value.includes("opus") || value.includes("sonnet") || value.includes("haiku")) {
		return "anthropic";
	}
	if (value.includes("openai") || value.includes("gpt") || value.includes("o1") || value.includes("o3") || value.includes("o4")) {
		return "gpt";
	}
	return "other";
}

export function resolveCrossProviderSecondOpinion(selectedPrimaryModel?: string | null): CrossProviderSecondOpinionTarget {
	const family = classifyProviderFamily(selectedPrimaryModel);
	if (family === "gpt") {
		return {
			provider: "anthropic",
			model: "claude-opus-4-6",
			role: SECOND_OPINION_ROLE,
			reason: "Primary advisor is GPT-family, so second opinion should come from Anthropic/Opus.",
		};
	}
	if (family === "anthropic") {
		return {
			provider: SECOND_OPINION_PROVIDER,
			model: SECOND_OPINION_MODEL,
			role: SECOND_OPINION_ROLE,
			reason: "Primary advisor is Anthropic-family, so second opinion should come from GPT-family.",
		};
	}
	return {
		provider: SECOND_OPINION_PROVIDER,
		model: SECOND_OPINION_MODEL,
		role: SECOND_OPINION_ROLE,
		reason: "Primary advisor provider is unknown, so use the configured fallback second-opinion target.",
	};
}

/**
 * Get a description of the advisor's role in the NORMAL mode workflow.
 */
export function getAdvisorDescription(selectedAdvisorModel?: string | null): string {
	const advisorModel = selectedAdvisorModel?.trim() || DEFAULT_ADVISOR_MODEL;
	return `Complex-work advisor using ${advisorModel}: reviews high-risk context, helps decide worker fan-out, and validates final outcomes for substantial work`;
}

/**
 * Normalize worker count to be within the allowed cap.
 */
export function normalizeWorkerCount(count: number): number {
	return Math.max(0, Math.min(count, MAX_WORKER_AGENTS));
}
