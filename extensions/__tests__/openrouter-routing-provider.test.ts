import { describe, it, expect, vi } from "vitest";

vi.mock("@mariozechner/pi-ai", () => ({
	streamSimpleOpenAICompletions: vi.fn((_model: any, _context: any, options: any) => options),
}));

import { createStreamFactory } from "../lib/openrouter-routing-provider.ts";

describe("openrouter-routing-provider", () => {
	it("passes through non-variant models unchanged", () => {
		const stream = createStreamFactory(new Map());
		const result = stream({ id: "openai/gpt-4o" } as any, {} as any, { hello: true } as any);
		expect(result.hello).toBe(true);
	});

	it("throws on stale synthetic variant ids", () => {
		const stream = createStreamFactory(new Map());
		expect(() => stream({ id: "@or:openai:openai/gpt-4o" } as any, {} as any, {} as any)).toThrow(/stale/i);
	});

	it("rewrites provider payload for pinned variants", async () => {
		const stream = createStreamFactory(new Map([
			["@or:openai:fp8:openai/gpt-4o", {
				syntheticId: "@or:openai:fp8:openai/gpt-4o",
				baseModelId: "openai/gpt-4o",
				providerSlug: "openai",
				providerName: "OpenAI",
				quantization: "fp8",
			} as any],
		]));
		const opts = stream({ id: "@or:openai:fp8:openai/gpt-4o" } as any, {} as any, {} as any);
		const payload = await opts.onPayload({ model: "@or:openai:fp8:openai/gpt-4o" }, {});
		expect(payload.model).toBe("openai/gpt-4o");
		expect(payload.provider.only).toEqual(["openai"]);
		expect(payload.provider.allow_fallbacks).toBe(false);
		expect(payload.provider.quantizations).toEqual(["fp8"]);
	});
});
