import { describe, expect, it } from "vitest";
import { buildSpecPrompt } from "../lib/mode-prompts.ts";

describe("buildSpecPrompt", () => {
	it("uses the selected advisor model when provided", () => {
		const result = buildSpecPrompt({ commanderAvailable: false, selectedAdvisorModel: "gpt-4.5" });
		expect(result).toContain("gpt-4.5");
	});

	it("falls back to default advisor model when selected model is absent", () => {
		const result = buildSpecPrompt({ commanderAvailable: false });
		expect(result).toContain("claude-opus-4-6");
	});

	it("includes quality-first guidance", () => {
		const result = buildSpecPrompt({ commanderAvailable: false });
		expect(result).toContain("Quality First");
		expect(result.toLowerCase()).toContain("quality is more important than speed");
	});

	it("describes 17-role orchestration and 16 non-advisor agents", () => {
		const result = buildSpecPrompt({ commanderAvailable: false });
		expect(result).toContain("17 total roles");
		expect(result).toMatch(/16 non-advisor agents|up to 16 non-advisor agents/);
	});

	it("includes mode escalation guidance for PLAN and SPEC", () => {
		const result = buildSpecPrompt({ commanderAvailable: false });
		expect(result).toContain("Switch to **PLAN** for complex tasks");
		expect(result).toContain("Switch to **SPEC** for really complex multi-step work");
	});

	it("states workers are preferred for content gathering", () => {
		const result = buildSpecPrompt({ commanderAvailable: false });
		expect(result.toLowerCase()).toContain("workers are preferred for content gathering");
	});

	it("uses cross-provider second opinion when primary advisor is Anthropic-family", () => {
		const result = buildSpecPrompt({ commanderAvailable: false, selectedAdvisorModel: "claude-opus-4-6" });
		expect(result).toContain("openai-codex/gpt-5.4");
	});

	it("uses Anthropic/Opus second opinion when primary advisor is GPT-family", () => {
		const result = buildSpecPrompt({ commanderAvailable: false, selectedAdvisorModel: "gpt-4.5" });
		expect(result).toContain("anthropic/claude-opus-4-6");
	});
});
