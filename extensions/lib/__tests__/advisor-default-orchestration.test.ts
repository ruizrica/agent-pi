// Test suite for advisor-default-orchestration module
// Verifies worker fan-out and second-opinion decision logic

import { describe, it, expect } from "vitest";
import {
	TaskComplexity,
	assessWorkerFanOut,
	assessSecondOpinion,
	getSecondOpinionRole,
	getAdvisorDescription,
	normalizeWorkerCount,
	resolveCrossProviderSecondOpinion,
} from "../advisor-default-orchestration.ts";

describe("advisor-default-orchestration", () => {
	describe("assessWorkerFanOut", () => {
		describe("SIMPLE tasks", () => {
			it("should recommend no workers for simple non-parallel tasks", () => {
				const decision = assessWorkerFanOut(TaskComplexity.SIMPLE, false);
				expect(decision.recommendedWorkerCount).toBe(0);
				expect(decision.complexity).toBe(TaskComplexity.SIMPLE);
				expect(decision.isParallelizable).toBe(false);
			});

			it("should recommend no workers for simple even if parallel", () => {
				const decision = assessWorkerFanOut(TaskComplexity.SIMPLE, true);
				expect(decision.recommendedWorkerCount).toBe(0);
				expect(decision.complexity).toBe(TaskComplexity.SIMPLE);
			});
		});

		describe("MEDIUM tasks", () => {
			it("should recommend 0 workers for medium sequential tasks", () => {
				const decision = assessWorkerFanOut(TaskComplexity.MEDIUM, false);
				expect(decision.recommendedWorkerCount).toBe(0);
				expect(decision.isParallelizable).toBe(false);
			});

			it("should recommend 2-3 workers for medium parallel tasks", () => {
				const decision = assessWorkerFanOut(TaskComplexity.MEDIUM, true);
				expect(decision.recommendedWorkerCount).toBeGreaterThan(1);
				expect(decision.recommendedWorkerCount).toBeLessThanOrEqual(4);
				expect(decision.isParallelizable).toBe(true);
			});
		});

		describe("COMPLEX tasks", () => {
			it("should recommend 0-1 workers for complex sequential tasks", () => {
				const decision = assessWorkerFanOut(TaskComplexity.COMPLEX, false);
				expect(decision.recommendedWorkerCount).toBeLessThanOrEqual(1);
				expect(decision.isParallelizable).toBe(false);
			});

			it("should recommend 4-6 workers for complex parallel tasks", () => {
				const decision = assessWorkerFanOut(TaskComplexity.COMPLEX, true);
				expect(decision.recommendedWorkerCount).toBeGreaterThanOrEqual(4);
				expect(decision.recommendedWorkerCount).toBeLessThanOrEqual(8);
				expect(decision.isParallelizable).toBe(true);
			});
		});

		describe("CRITICAL tasks", () => {
			it("should recommend 0-1 workers for critical sequential tasks", () => {
				const decision = assessWorkerFanOut(TaskComplexity.CRITICAL, false);
				expect(decision.recommendedWorkerCount).toBeLessThanOrEqual(1);
				expect(decision.isParallelizable).toBe(false);
			});

			it("should recommend 16 non-advisor agents for critical parallel tasks", () => {
				const decision = assessWorkerFanOut(TaskComplexity.CRITICAL, true);
				expect(decision.recommendedWorkerCount).toBe(16);
				expect(decision.isParallelizable).toBe(true);
			});
		});

		it("should include reason in decision", () => {
			const decision = assessWorkerFanOut(TaskComplexity.MEDIUM, true);
			expect(decision.reason).toBeTruthy();
			expect(decision.reason.length).toBeGreaterThan(0);
		});

		it("should prefer workers for gathering", () => {
			const decision = assessWorkerFanOut(TaskComplexity.COMPLEX, true);
			expect(decision.preferredGatheringRole).toBe("worker");
		});
	});

	describe("assessSecondOpinion", () => {
		describe("SIMPLE tasks", () => {
			it("should not recommend second opinion for simple tasks", () => {
				const decision = assessSecondOpinion(TaskComplexity.SIMPLE);
				expect(decision.recommended).toBe(false);
			});

			it("should not recommend even with risky hints", () => {
				const decision = assessSecondOpinion(TaskComplexity.SIMPLE, { isRisky: true });
				expect(decision.recommended).toBe(false);
			});
		});

		describe("MEDIUM tasks", () => {
			it("should not recommend second opinion for straightforward medium tasks", () => {
				const decision = assessSecondOpinion(TaskComplexity.MEDIUM);
				expect(decision.recommended).toBe(false);
			});

			it("should recommend for architectural medium tasks", () => {
				const decision = assessSecondOpinion(TaskComplexity.MEDIUM, { isArchitectural: true });
				expect(decision.recommended).toBe(true);
			});

			it("should recommend for risky medium tasks", () => {
				const decision = assessSecondOpinion(TaskComplexity.MEDIUM, { isRisky: true });
				expect(decision.recommended).toBe(true);
			});

			it("should recommend for ambiguous medium tasks", () => {
				const decision = assessSecondOpinion(TaskComplexity.MEDIUM, { isAmbiguous: true });
				expect(decision.recommended).toBe(true);
			});
		});

		describe("COMPLEX tasks", () => {
			it("should recommend second opinion for complex tasks", () => {
				const decision = assessSecondOpinion(TaskComplexity.COMPLEX);
				expect(decision.recommended).toBe(true);
			});
		});

		describe("CRITICAL tasks", () => {
			it("should recommend second opinion for critical tasks", () => {
				const decision = assessSecondOpinion(TaskComplexity.CRITICAL);
				expect(decision.recommended).toBe(true);
			});
		});

		it("should include reason in decision", () => {
			const decision = assessSecondOpinion(TaskComplexity.COMPLEX);
			expect(decision.reason).toBeTruthy();
			expect(decision.reason.length).toBeGreaterThan(0);
		});

		it("should specify a role for second opinion", () => {
			const decision = assessSecondOpinion(TaskComplexity.COMPLEX);
			expect(decision.role).toBeTruthy();
			expect(["red-team", "reviewer"]).toContain(decision.role);
		});
	});

	describe("getSecondOpinionRole", () => {
		it("should return primary role by default", () => {
			expect(getSecondOpinionRole()).toBe("red-team");
		});

		it("should return fallback role when requested", () => {
			expect(getSecondOpinionRole(true)).toBe("reviewer");
		});

		it("should return primary role when explicitly set to false", () => {
			expect(getSecondOpinionRole(false)).toBe("red-team");
		});
	});

	describe("getAdvisorDescription", () => {
		it("should return a non-empty description", () => {
			const desc = getAdvisorDescription();
			expect(desc).toBeTruthy();
			expect(desc.length).toBeGreaterThan(0);
		});

		it("should mention the fallback advisor model", () => {
			const desc = getAdvisorDescription();
			expect(desc).toContain("claude-opus-4-6");
		});

		it("should mention the selected advisor model when provided", () => {
			const desc = getAdvisorDescription("gpt-4.5");
			expect(desc).toContain("gpt-4.5");
		});

		it("should mention advisor responsibilities", () => {
			const desc = getAdvisorDescription();
			expect(desc.toLowerCase()).toContain("advisor");
		});
	});

	describe("resolveCrossProviderSecondOpinion", () => {
		it("chooses Anthropic/Opus when the primary model is GPT-family", () => {
			const result = resolveCrossProviderSecondOpinion("gpt-4.5");
			expect(result.provider).toBe("anthropic");
			expect(result.model).toBe("claude-opus-4-6");
		});

		it("chooses GPT-family when the primary model is Anthropic-family", () => {
			const result = resolveCrossProviderSecondOpinion("claude-opus-4-6");
			expect(result.provider).toBe("openai-codex");
			expect(result.model).toBe("gpt-5.4");
		});

		it("falls back to configured reviewer target for unknown providers", () => {
			const result = resolveCrossProviderSecondOpinion("mystery-model");
			expect(result.provider).toBe("openai-codex");
			expect(result.model).toBe("gpt-5.4");
		});
	});

	describe("normalizeWorkerCount", () => {
		it("should keep counts in valid range", () => {
			expect(normalizeWorkerCount(0)).toBe(0);
			expect(normalizeWorkerCount(4)).toBe(4);
			expect(normalizeWorkerCount(16)).toBe(16);
		});

		it("should clamp negative numbers to 0", () => {
			expect(normalizeWorkerCount(-1)).toBe(0);
			expect(normalizeWorkerCount(-100)).toBe(0);
		});

		it("should clamp numbers above cap to 16", () => {
			expect(normalizeWorkerCount(17)).toBe(16);
			expect(normalizeWorkerCount(100)).toBe(16);
		});
	});
});
