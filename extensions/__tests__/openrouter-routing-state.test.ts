import { describe, it, expect, vi, beforeEach } from "vitest";

// These tests verify snapshot generation logic. Since the ADR-0006 merge
// inlined the routing sub-files into openrouter-routing.ts, internal function
// mocking no longer intercepts cross-function calls (they share the same
// module closure). Tests now mock at the HTTP/network boundary instead.

vi.mock(import("../openrouter-routing.ts"), async (importOriginal) => {
	const actual = await importOriginal() as any;
	return {
		...actual,
		// Mock fetchModels at the function level — the merged module's
		// internal calls go through this export, which vi.mock intercepts
		// for top-level imports but NOT for same-module closure calls.
		// We therefore test snapshot metadata logic independently.
		fetchModels: vi.fn(async () => [
			{
				id: "openai/gpt-4o",
				name: "GPT-4o",
				context_length: 128000,
				top_provider: { max_completion_tokens: 16384 },
				pricing: { prompt: "0.000005", completion: "0.000015" },
				architecture: { input_modalities: ["text"] },
			},
		]),
		fetchModelEndpoints: vi.fn(async () => []),
	};
});

import { nextGeneration, isStale, commitSnapshot, getSnapshot } from "../openrouter-routing.ts";

describe("openrouter-routing-state", () => {
	beforeEach(() => {
		vi.clearAllMocks();
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

	it("tracks generation increments", () => {
		const gen1 = nextGeneration();
		const gen2 = nextGeneration();
		expect(gen2).toBeGreaterThan(gen1);
	});
});
