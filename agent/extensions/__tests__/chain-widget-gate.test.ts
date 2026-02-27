// Test suite for chain widget visibility gate
// Validates that the widget only shows when pipeline is actually running

import { describe, it, expect } from "vitest";

// Mirror the StepState type from agent-chain.ts (line 55-61)
type StepStatus = "pending" | "running" | "done" | "error";

// This mirrors the guard logic we're adding to updateWidget() in agent-chain.ts
function shouldShowChainWidget(stepStates: { status: StepStatus }[]): boolean {
	return stepStates.some(s => s.status !== "pending");
}

describe("shouldShowChainWidget", () => {
	it("should NOT show when all steps are pending (session init)", () => {
		const steps = [
			{ status: "pending" as StepStatus },
			{ status: "pending" as StepStatus },
			{ status: "pending" as StepStatus },
		];
		expect(shouldShowChainWidget(steps)).toBe(false);
	});

	it("should NOT show when step list is empty", () => {
		expect(shouldShowChainWidget([])).toBe(false);
	});

	it("should show when first step is running", () => {
		const steps = [
			{ status: "running" as StepStatus },
			{ status: "pending" as StepStatus },
			{ status: "pending" as StepStatus },
		];
		expect(shouldShowChainWidget(steps)).toBe(true);
	});

	it("should show when a step is done", () => {
		const steps = [
			{ status: "done" as StepStatus },
			{ status: "running" as StepStatus },
			{ status: "pending" as StepStatus },
		];
		expect(shouldShowChainWidget(steps)).toBe(true);
	});

	it("should show when a step has error", () => {
		const steps = [
			{ status: "error" as StepStatus },
			{ status: "pending" as StepStatus },
		];
		expect(shouldShowChainWidget(steps)).toBe(true);
	});

	it("should show when all steps are done", () => {
		const steps = [
			{ status: "done" as StepStatus },
			{ status: "done" as StepStatus },
			{ status: "done" as StepStatus },
		];
		expect(shouldShowChainWidget(steps)).toBe(true);
	});
});
