import { describe, expect, it } from "vitest";
import { classifyPlanComplexity, mapComplexityToMode, getPlanTargetMode } from "../lib/plan-complexity.ts";

describe("plan-complexity", () => {
	describe("classifyPlanComplexity", () => {
		it("detects explicit simple marker with HTML comment", () => {
			const markdown = `# My Plan
<!-- simple -->
This is a simple plan.`;
			const result = classifyPlanComplexity(markdown);
			expect(result.complexity).toBe("simple");
			expect(result.reason).toContain("Explicit simple marker");
		});

		it("detects explicit simple marker with heading", () => {
			const markdown = `# Simple
This is a simple plan.`;
			const result = classifyPlanComplexity(markdown);
			expect(result.complexity).toBe("simple");
			expect(result.reason).toContain("Explicit simple marker");
		});

		it("classifies single-phase plan as simple", () => {
			const markdown = `# Plan
## Phase 1: Do the work
- Task 1
- Task 2`;
			const result = classifyPlanComplexity(markdown);
			expect(result.complexity).toBe("simple");
			expect(result.phases).toBe(1);
		});

		it("classifies two-phase plan as simple", () => {
			const markdown = `# Plan
## Phase 1: Research
- Task 1
## Phase 2: Implement
- Task 2`;
			const result = classifyPlanComplexity(markdown);
			expect(result.complexity).toBe("simple");
			expect(result.phases).toBe(2);
		});

		it("classifies three-phase plan as complete", () => {
			const markdown = `# Plan
## Phase 1: Research
- Task 1
## Phase 2: Implement
- Task 2
## Phase 3: Test
- Task 3`;
			const result = classifyPlanComplexity(markdown);
			expect(result.complexity).toBe("complete");
			expect(result.phases).toBe(3);
		});

		it("classifies large plan with no phases as complete", () => {
			const markdown = `# Plan\n${Array(60).fill("- Task").join("\n")}`;
			const result = classifyPlanComplexity(markdown);
			expect(result.complexity).toBe("complete");
		});

		it("classifies small plan with no phases as simple", () => {
			const markdown = `# Plan
- Task 1`;
			const result = classifyPlanComplexity(markdown);
			expect(result.complexity).toBe("simple");
			expect(result.phases).toBe(0);
		});

		it("explicit marker overrides phase count", () => {
			const markdown = `# Simple
<!-- simple -->
## Phase 1: Research
- Task 1
## Phase 2: Implement
- Task 2
## Phase 3: Test
- Task 3`;
			const result = classifyPlanComplexity(markdown);
			expect(result.complexity).toBe("simple");
			expect(result.reason).toContain("Explicit simple marker");
			expect(result.phases).toBe(3);
		});

		it("counts phases with numbered format", () => {
			const markdown = `# Plan
## Phase 1: First
- Task
## Phase 2: Second
- Task
## Phase 3: Third
- Task
## Phase 4: Fourth
- Task`;
			const result = classifyPlanComplexity(markdown);
			expect(result.phases).toBe(4);
			expect(result.complexity).toBe("complete");
		});
	});

	describe("mapComplexityToMode", () => {
		it("maps simple to null (no post-approval mode switch)", () => {
			expect(mapComplexityToMode("simple")).toBeNull();
		});

		it("maps complete to PIPELINE", () => {
			expect(mapComplexityToMode("complete")).toBe("PIPELINE");
		});
	});

	describe("getPlanTargetMode", () => {
		it("returns null mode for simple plan", () => {
			const markdown = `# Plan
## Phase 1: Do it
- Task`;
			const result = getPlanTargetMode(markdown);
			expect(result.mode).toBeNull();
			expect(result.complexity).toBe("simple");
		});

		it("returns PIPELINE for complete plan", () => {
			const markdown = `# Plan
## Phase 1: A
- Task
## Phase 2: B
- Task
## Phase 3: C
- Task`;
			const result = getPlanTargetMode(markdown);
			expect(result.mode).toBe("PIPELINE");
			expect(result.complexity).toBe("complete");
		});

		it("includes reasoning in result", () => {
			const markdown = `# Plan
## Phase 1: Do it
- Task`;
			const result = getPlanTargetMode(markdown);
			expect(result.reason).toBeDefined();
			expect(result.reason.length).toBeGreaterThan(0);
		});
	});
});
