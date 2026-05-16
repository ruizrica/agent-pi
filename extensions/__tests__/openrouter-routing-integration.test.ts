import { describe, it, expect, vi } from "vitest";

vi.mock("../lib/openrouter-routing-api.ts", () => ({
	invalidateAllCaches: vi.fn(),
	fetchKeyInfo: vi.fn(),
	fetchCredits: vi.fn(),
	fetchModels: vi.fn(),
	fetchModelEndpoints: vi.fn(),
	getCacheAgeMs: vi.fn(() => 0),
}));

vi.mock("../lib/openrouter-routing-state.ts", () => ({
	getSnapshot: vi.fn(() => ({ models: [{ id: "openai/gpt-4o" }], routes: new Map(), enrichedModelIds: new Set(), timestamp: Date.now(), syncMode: "plain", endpointFailures: 0, baseModelCount: 1 })),
	nextGeneration: vi.fn(() => 1),
	isStale: vi.fn(() => false),
	buildPlainSync: vi.fn(async () => ({ models: [{ id: "openai/gpt-4o" }], routes: new Map(), modelCount: 1, syncMode: "plain", endpointFailures: 0, baseModelCount: 1 })),
	buildEnrichedSync: vi.fn(async () => ({ models: [{ id: "openai/gpt-4o" }, { id: "@or:openai:openai/gpt-4o" }], routes: new Map([["@or:openai:openai/gpt-4o", { syntheticId: "@or:openai:openai/gpt-4o" }]]), enrichedModelIds: new Set(["openai/gpt-4o"]), modelCount: 1, variantCount: 1, syncMode: "enriched", endpointFailures: 0, baseModelCount: 1 })),
	commitSnapshot: vi.fn(() => true),
	getCachedModelList: vi.fn(() => [{ id: "openai/gpt-4o", name: "GPT-4o" }]),
}));

vi.mock("../lib/openrouter-routing-picker.ts", () => ({
	createModelPicker: vi.fn(),
	rankModelsForQuery: vi.fn((models: any) => models),
}));

import openrouterRoutingExtension from "../openrouter-routing.ts";

describe("openrouter-routing-integration", () => {
	it("registers the expected provider shape during sync", async () => {
		const commands: Record<string, any> = {};
		const pi = {
			registerCommand: (name: string, config: any) => { commands[name] = config; },
			on: vi.fn(),
			registerProvider: vi.fn(),
			sendMessage: vi.fn(),
		} as any;
		openrouterRoutingExtension(pi);
		const ctx = { modelRegistry: { getApiKeyForProvider: vi.fn(async () => "key") }, ui: { notify: vi.fn(), setStatus: vi.fn(), custom: vi.fn() } };
		await commands["openrouter-sync"].handler("", ctx);
		expect(pi.registerProvider).toHaveBeenCalledWith("openrouter", expect.objectContaining({
			baseUrl: "https://openrouter.ai/api/v1",
			apiKey: "OPENROUTER_API_KEY",
			api: "openai-completions",
		}));
	});
});
