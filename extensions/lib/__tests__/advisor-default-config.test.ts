// Test suite for advisor-default-config module
// Verifies that all shared constants and helpers are correctly exported

import { describe, it, expect } from "vitest";
import {
	DEFAULT_ADVISOR_MODEL,
	DEFAULT_ADVISOR_PROVIDER,
	PREFERRED_WORKER_MODEL,
	PREFERRED_WORKER_PROVIDER,
	FALLBACK_WORKER_MODEL,
	FALLBACK_WORKER_PROVIDER,
	MAX_WORKER_AGENTS,
	SECOND_OPINION_ROLE,
	SECOND_OPINION_FALLBACK_ROLE,
	SECOND_OPINION_MODEL,
	SECOND_OPINION_PROVIDER,
	buildModelIdentifier,
	getAdvisorModelId,
	getPreferredWorkerModelId,
	getFallbackWorkerModelId,
	getSecondOpinionModelId,
	describeWorkerModelPreference,
	describeSecondOpinionAgents,
} from "../advisor-default-config.ts";

describe("advisor-default-config", () => {
	describe("constants", () => {
		it("should export advisor model constants", () => {
			expect(DEFAULT_ADVISOR_MODEL).toBe("claude-opus-4-6");
			expect(DEFAULT_ADVISOR_PROVIDER).toBe("anthropic");
		});

		it("should export preferred worker model constants", () => {
			expect(PREFERRED_WORKER_MODEL).toBe("grok-4.1-fast");
			expect(PREFERRED_WORKER_PROVIDER).toBe("x-ai");
		});

		it("should export fallback worker model constants", () => {
			expect(FALLBACK_WORKER_MODEL).toBe("claude-haiku-4-5");
			expect(FALLBACK_WORKER_PROVIDER).toBe("anthropic");
		});

		it("should export max worker agents cap", () => {
			expect(MAX_WORKER_AGENTS).toBe(16);
			expect(MAX_WORKER_AGENTS).toBeGreaterThan(0);
			expect(MAX_WORKER_AGENTS).toBeLessThanOrEqual(16);
		});

		it("should export second opinion role constants", () => {
			expect(SECOND_OPINION_ROLE).toBe("red-team");
			expect(SECOND_OPINION_FALLBACK_ROLE).toBe("reviewer");
			expect(SECOND_OPINION_MODEL).toBe("gpt-5.4");
			expect(SECOND_OPINION_PROVIDER).toBe("openai-codex");
		});
	});

	describe("buildModelIdentifier", () => {
		it("should build full model identifier with provider", () => {
			expect(buildModelIdentifier("anthropic", "claude-opus-4-6")).toBe("anthropic/claude-opus-4-6");
			expect(buildModelIdentifier("x-ai", "grok-4.1-fast")).toBe("x-ai/grok-4.1-fast");
		});

		it("should return just model if provider is empty", () => {
			expect(buildModelIdentifier("", "claude-haiku")).toBe("claude-haiku");
		});
	});

	describe("model identifier getters", () => {
		it("should get advisor model identifier", () => {
			const id = getAdvisorModelId();
			expect(id).toBe("anthropic/claude-opus-4-6");
		});

		it("should get preferred worker model identifier", () => {
			const id = getPreferredWorkerModelId();
			expect(id).toBe("x-ai/grok-4.1-fast");
		});

		it("should get fallback worker model identifier", () => {
			const id = getFallbackWorkerModelId();
			expect(id).toBe("anthropic/claude-haiku-4-5");
		});

		it("should get second opinion model identifier", () => {
			const id = getSecondOpinionModelId();
			expect(id).toBe("openai-codex/gpt-5.4");
		});
	});

	describe("descriptor functions", () => {
		it("should describe worker model preference", () => {
			const desc = describeWorkerModelPreference();
			expect(desc).toContain("grok-4.1-fast");
			expect(desc).toContain("claude-haiku");
			expect(desc).toContain("Prefers");
		});

		it("should describe second opinion agents", () => {
			const desc = describeSecondOpinionAgents();
			expect(desc).toContain("red-team");
			expect(desc).toContain("reviewer");
			expect(desc).toContain("gpt-5.4");
		});
	});
});
