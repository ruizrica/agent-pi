// ABOUTME: Tests advisor prompt/response normalization helpers.

import { describe, expect, it } from "vitest";
import { buildAdvisorPrompt, normalizeAdvisorResponse } from "../lib/claude-advice-format.ts";

describe("buildAdvisorPrompt", () => {
	it("includes the requested structure", () => {
		const prompt = buildAdvisorPrompt("Should we split the runtime into worker and advisor profiles?");
		expect(prompt).toContain("Summary:");
		expect(prompt).toContain("Recommended decision:");
		expect(prompt).toContain("Risks:");
		expect(prompt).toContain("Alternatives:");
		expect(prompt).toContain("Next actions:");
	});

	it("includes role context when provided", () => {
		const prompt = buildAdvisorPrompt("How should we approach the refactor?", "builder");
		expect(prompt).toContain("You are advising a builder agent");
	});
});

describe("normalizeAdvisorResponse", () => {
	it("extracts recommendation sections when present", () => {
		const response = normalizeAdvisorResponse([
			"Summary: Use two profiles.",
			"Recommended decision: Keep worker and advisor separate.",
			"Risks:",
			"- More plumbing",
			"Alternatives:",
			"- One generic Claude agent",
			"Next actions:",
			"- Build the shared CLI runtime",
		].join("\n"));

		expect(response.summary).toContain("Summary:");
		expect(response.recommendation).toContain("Keep worker and advisor separate");
		expect(response.risks).toEqual(["More plumbing"]);
		expect(response.alternatives).toEqual(["One generic Claude agent"]);
		expect(response.nextActions).toEqual(["Build the shared CLI runtime"]);
	});
});
