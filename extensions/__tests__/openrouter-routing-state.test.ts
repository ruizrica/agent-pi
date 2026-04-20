import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/openrouter-routing-api.ts", () => ({
	fetchModels: vi.fn(),
	getCachedModels: vi.fn(),
}));

vi.mock("../lib/openrouter-routing-models.ts", () => ({
	toProviderModel: vi.fn((m: any) => ({ id: m.id, name: m.name || m.id, reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1, maxTokens: 1 })),
	enrichModel: vi.fn(),
}));

import { fetchModels, getCachedModels } from "../lib/openrouter-routing-api.ts";
import { enrichModel } from "../lib/openrouter-routing-models.ts";
import {
	buildPlainSync,
	buildEnrichedSync,
	nextGeneration,
	isStale,
	commitSnapshot,
	getSnapshot,
	getCachedModelList,
} from "../lib/openrouter-routing-state.ts";

describe("openrouter-routing-state", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("builds a plain sync snapshot", async () => {
		vi.mocked(fetchModels).mockResolvedValue([{ id: "openai/gpt-4o", name: "GPT-4o" }] as any);
		const result = await buildPlainSync("key", true);
		expect(result.syncMode).toBe("plain");
		expect(result.modelCount).toBe(1);
		expect(result.baseModelCount).toBe(1);
	});

	it("builds an enriched sync snapshot", async () => {
		vi.mocked(fetchModels).mockResolvedValue([{ id: "openai/gpt-4o", name: "GPT-4o" }] as any);
		vi.mocked(enrichModel).mockResolvedValue({
			variants: [{ id: "@or:openai:openai/gpt-4o", name: "Variant" }],
			routes: new Map([["@or:openai:openai/gpt-4o", { syntheticId: "@or:openai:openai/gpt-4o" }]]),
			variantCount: 1,
			endpointFailures: 0,
		} as any);
		const result = await buildEnrichedSync("openai/gpt-4o", "key", true);
		expect(result.syncMode).toBe("enriched");
		expect(result.variantCount).toBe(1);
		expect(result.models).toHaveLength(2);
	});

	it("rejects stale snapshot commits", () => {
		const oldGen = nextGeneration();
		const newer = nextGeneration();
		expect(isStale(oldGen)).toBe(true);
		expect(isStale(newer)).toBe(false);
		const committed = commitSnapshot(oldGen, [], new Map());
		expect(committed).toBe(false);
	});

	it("commits current snapshot metadata", () => {
		const gen = nextGeneration();
		const committed = commitSnapshot(gen, [{ id: "x" } as any], new Map(), { syncMode: "enriched", endpointFailures: 2, baseModelCount: 1, enrichedModelIds: new Set(["x"]) });
		expect(committed).toBe(true);
		const snapshot = getSnapshot();
		expect(snapshot.syncMode).toBe("enriched");
		expect(snapshot.endpointFailures).toBe(2);
		expect(snapshot.enrichedModelIds.has("x")).toBe(true);
	});

	it("exposes cached model list", () => {
		vi.mocked(getCachedModels).mockReturnValue([{ id: "openai/gpt-4o" }] as any);
		expect(getCachedModelList()).toEqual([{ id: "openai/gpt-4o" }]);
	});
});
