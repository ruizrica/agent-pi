// ABOUTME: Classifies plan complexity (simple vs complete) for auto mode switching.
// ABOUTME: Detects explicit markers and counts phases to determine target mode on approval.

export type PlanComplexity = "simple" | "complete";
export type PlannedMode = "NORMAL" | "PIPELINE" | "CHAIN";

interface ComplexityResult {
	complexity: PlanComplexity;
	reason: string;
	phases: number;
}

/**
 * Detects explicit complexity markers in markdown.
 * Returns true if the plan is marked as simple.
 */
function hasExplicitSimpleMarker(markdown: string): boolean {
	return /<!--\s*simple\s*-->|^#\s+Simple\s*$/m.test(markdown);
}

/**
 * Counts distinct phase headers in markdown (e.g., "## Phase 1:", "## Phase 2:").
 * Counts any "## Phase N:" or "## Phase:" pattern.
 */
function countPhases(markdown: string): number {
	const phaseMatches = markdown.match(/^##\s+Phase\s+\d+:|^##\s+Phase:/gm);
	return phaseMatches ? phaseMatches.length : 0;
}

/**
 * Classifies plan complexity based on explicit markers and phase count.
 * Explicit markers override heuristics.
 */
export function classifyPlanComplexity(markdown: string): ComplexityResult {
	const hasMarker = hasExplicitSimpleMarker(markdown);
	const phases = countPhases(markdown);

	// Explicit marker takes precedence
	if (hasMarker) {
		return {
			complexity: "simple",
			reason: "Explicit simple marker found in plan",
			phases,
		};
	}

	// Heuristic: 1-2 phases = simple, 3+ = complete
	if (phases <= 2 && phases > 0) {
		return {
			complexity: "simple",
			reason: `Plan has ${phases} phase(s) (simple threshold)`,
			phases,
		};
	}

	if (phases >= 3) {
		return {
			complexity: "complete",
			reason: `Plan has ${phases} phases (complete threshold)`,
			phases,
		};
	}

	// No phases detected: default to simple if very small, else complete
	const lineCount = markdown.split("\n").length;
	if (lineCount <= 50) {
		return {
			complexity: "simple",
			reason: "Plan is small and has no explicit phases",
			phases: 0,
		};
	}

	return {
		complexity: "complete",
		reason: "Plan has no phases but is large; treating as complete",
		phases: 0,
	};
}

/**
 * Maps plan complexity to target mode after approval.
 * Simple → NORMAL, Complete → PIPELINE.
 */
export function mapComplexityToMode(complexity: PlanComplexity): PlannedMode {
	return complexity === "simple" ? "NORMAL" : "PIPELINE";
}

/**
 * All-in-one: classify complexity and return target mode (or null for no switch).
 */
export function getPlanTargetMode(markdown: string): { mode: PlannedMode | null; complexity: PlanComplexity; reason: string } {
	const result = classifyPlanComplexity(markdown);
	return {
		mode: mapComplexityToMode(result.complexity),
		complexity: result.complexity,
		reason: result.reason,
	};
}
