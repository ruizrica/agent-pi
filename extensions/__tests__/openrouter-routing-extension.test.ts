import { describe, it, expect, vi } from "vitest";

vi.mock(import("../openrouter-routing.ts"), async (importOriginal) => {
	const actual = await importOriginal() as any;
	return {
		...actual,
		invalidateAllCaches: vi.fn(),
		fetchKeyInfo: vi.fn(),
		fetchCredits: vi.fn(),
		fetchModels: vi.fn(),
		fetchModelEndpoints: vi.fn(),
		getCacheAgeMs: vi.fn(() => 120000),
		getSnapshot: vi.fn(() => ({ models: [{ id: "openai/gpt-4o" }], routes: new Map(), enrichedModelIds: new Set(), timestamp: Date.now(), syncMode: "plain", endpointFailures: 0, baseModelCount: 1 })),
		nextGeneration: vi.fn(() => 1),
		isStale: vi.fn(() => false),
		buildPlainSync: vi.fn(async () => ({ models: [{ id: "openai/gpt-4o" }], routes: new Map(), modelCount: 1, syncMode: "plain", endpointFailures: 0, baseModelCount: 1 })),
		buildEnrichedSync: vi.fn(async () => ({ models: [{ id: "openai/gpt-4o" }, { id: "@or:openai:openai/gpt-4o" }], routes: new Map([["@or:openai:openai/gpt-4o", { syntheticId: "@or:openai:openai/gpt-4o" }]]), enrichedModelIds: new Set(["openai/gpt-4o"]), modelCount: 1, variantCount: 1, syncMode: "enriched", endpointFailures: 0, baseModelCount: 1 })),
		commitSnapshot: vi.fn(() => true),
		getCachedModelList: vi.fn(() => [{ id: "openai/gpt-4o", name: "GPT-4o" }]),
	};
});

import openrouterRoutingExtension from "../openrouter-routing.ts";

describe("openrouter-routing extension", () => {
	it("registers the context hook on init", () => {
		const pi = {
			on: vi.fn(),
			registerProvider: vi.fn(),
			registerCommand: vi.fn(),
			sendMessage: vi.fn(),
		};

		openrouterRoutingExtension(pi);
		expect(pi.on).toHaveBeenCalledWith("context", expect.any(Function));
	});

	it("registers one canonical openrouter command", () => {
		const pi = {
			on: vi.fn(),
			registerProvider: vi.fn(),
			registerCommand: vi.fn(),
			sendMessage: vi.fn(),
		};

		openrouterRoutingExtension(pi);
		const commandNames = pi.registerCommand.mock.calls.map((call: any) => call[0]);
		expect(commandNames).toContain("openrouter");
		for (const retired of ["openrouter-sync", "openrouter-enrich", "openrouter-preview", "openrouter-balance", "openrouter-status"]) {
			expect(commandNames).not.toContain(retired);
		}
	});
});
