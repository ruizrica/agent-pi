import { describe, it, expect, vi } from "vitest";

vi.mock("../lib/openrouter-routing-api.ts", () => ({
	fetchModelEndpoints: vi.fn(),
}));

import { fetchModelEndpoints } from "../lib/openrouter-routing-api.ts";
import {
	parseCost,
	isReasoningModel,
	supportsImages,
	toProviderModel,
	slugifyProvider,
	createVariantId,
	groupEndpoints,
	rankModelsForQuery,
	formatEndpointHealth,
	enrichModel,
} from "../lib/openrouter-routing-models.ts";

describe("openrouter-routing-models", () => {
	it("parses OpenRouter per-token pricing to per-million pricing", () => {
		expect(parseCost("0.000002")).toBe(2);
		expect(parseCost("")).toBeUndefined();
		expect(parseCost(undefined)).toBeUndefined();
	});

	it("detects reasoning and image capabilities", () => {
		expect(isReasoningModel({ id: "openai/o3-mini", name: "o3-mini" } as any)).toBe(true);
		expect(supportsImages({ input_modalities: ["text", "image"] })).toBe(true);
		expect(supportsImages({ modality: "multimodal-text-image" })).toBe(true);
		expect(supportsImages({ input_modalities: ["text"] })).toBe(false);
	});

	it("normalizes a base model into provider config", () => {
		const out = toProviderModel({
			id: "anthropic/claude-3.5-sonnet",
			name: "Claude 3.5 Sonnet",
			context_length: 200000,
			top_provider: { max_completion_tokens: 8192 },
			pricing: { prompt: "0.000003", completion: "0.000015" },
			architecture: { input_modalities: ["text", "image"] },
		} as any);
		expect(out.id).toBe("anthropic/claude-3.5-sonnet");
		expect(out.cost.input).toBe(3);
		expect(out.cost.output).toBe(15);
		expect(out.input).toEqual(["text", "image"]);
		expect(out.contextWindow).toBe(200000);
	});

	it("preserves large base model context windows", () => {
		const out = toProviderModel({
			id: "openai/gpt-5",
			name: "GPT-5",
			context_length: 1_000_000,
			top_provider: { max_completion_tokens: 128000 },
			pricing: { prompt: "0.00000125", completion: "0.00001" },
		} as any);
		expect(out.contextWindow).toBe(1_000_000);
	});

	it("creates provider slugs and variant ids", () => {
		expect(slugifyProvider("OpenAI Hosted")).toBe("openai-hosted");
		expect(createVariantId("anthropic/claude-3.5-sonnet", "openai", "fp8")).toBe("@or:openai:fp8:anthropic/claude-3.5-sonnet");
	});

	it("groups endpoints by provider and quantization", () => {
		const groups = groupEndpoints(
			{ id: "anthropic/claude-3.5-sonnet", name: "Claude" } as any,
			[
				{ provider_name: "OpenAI", quantization: "fp8", status: -1, supports_implicit_caching: false },
				{ provider_name: "OpenAI", quantization: "fp8", status: 0, uptime_last_30m: 99.2, latency_last_30m: { p50: 220 } },
				{ provider_name: "Together", quantization: "int4", status: -2, supports_implicit_caching: true },
			] as any,
		);
		expect(groups).toHaveLength(2);
		expect(groups[0].route.syntheticId.startsWith("@or:")).toBe(true);
		expect(groups[0].route.endpointStatus).toBeDefined();
	});

	it("ranks exact id and tokenized matches ahead of fuzzy matches", () => {
		const models = [
			{ id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet" },
			{ id: "openai/gpt-4o", name: "GPT-4o" },
			{ id: "qwen/qwen2.5-coder", name: "Qwen 2.5 Coder" },
		] as any;
		const ranked = rankModelsForQuery(models, "qwen coder");
		expect(ranked[0].id).toBe("qwen/qwen2.5-coder");
	});

	it("preserves canonical model context window when endpoint variants advertise smaller limits", async () => {
		vi.mocked(fetchModelEndpoints).mockResolvedValue([
			{
				provider_name: "OpenAI",
				context_length: 272000,
				max_completion_tokens: 64000,
			},
		] as any);

		const result = await enrichModel(
			[
				{
					id: "openai/gpt-5",
					name: "GPT-5",
					context_length: 1_000_000,
					top_provider: { max_completion_tokens: 128000 },
					pricing: { prompt: "0.00000125", completion: "0.00001" },
				},
			] as any,
			"openai/gpt-5",
			undefined,
		);

		expect(result.variants).toHaveLength(1);
		expect(result.variants[0].contextWindow).toBe(1_000_000);
		expect(result.variants[0].maxTokens).toBe(64000);
	});

	it("formats endpoint health text", () => {
		const text = formatEndpointHealth({ endpointStatus: 0, uptimePct: 99.9, latencyP50: 180 } as any);
		expect(text).toContain("healthy");
		expect(text).toContain("99.9% uptime");
		expect(text).toContain("180ms");
	});
});
