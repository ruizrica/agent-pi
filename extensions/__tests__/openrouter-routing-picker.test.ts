import { describe, it, expect } from "vitest";
import { rankModelsForQuery } from "../lib/openrouter-routing-picker.ts";

describe("openrouter-routing-picker", () => {
	const models = [
		{ id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet" },
		{ id: "openai/gpt-4o", name: "GPT-4o" },
		{ id: "qwen/qwen2.5-coder", name: "Qwen 2.5 Coder" },
	] as any;

	it("returns stable sorted results for empty query", () => {
		const ranked = rankModelsForQuery(models, "");
		expect(ranked.map((m) => m.id)).toEqual([
			"anthropic/claude-3.5-sonnet",
			"openai/gpt-4o",
			"qwen/qwen2.5-coder",
		]);
	});

	it("prefers exact id and name matches", () => {
		const ranked = rankModelsForQuery(models, "GPT-4o");
		expect(ranked[0].id).toBe("openai/gpt-4o");
	});

	it("handles tokenization across separators", () => {
		const ranked = rankModelsForQuery(models, "qwen 2.5 coder");
		expect(ranked[0].id).toBe("qwen/qwen2.5-coder");
	});
});
