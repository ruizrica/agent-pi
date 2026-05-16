import { describe, it, expect, vi } from "vitest";

vi.mock("../lib/openrouter-routing-api.ts", () => ({
	invalidateAllCaches: vi.fn(),
	fetchKeyInfo: vi.fn(),
	fetchCredits: vi.fn(),
	fetchModels: vi.fn(),
	fetchModelEndpoints: vi.fn(),
	getCacheAgeMs: vi.fn(() => 120000),
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
import { fetchModels, fetchModelEndpoints, fetchKeyInfo, fetchCredits } from "../lib/openrouter-routing-api.ts";

describe("openrouter-routing-extension", () => {
	it("registers commands and context hook", () => {
		const commands: string[] = [];
		const events: string[] = [];
		const pi = {
			registerCommand: (name: string) => commands.push(name),
			on: (event: string) => events.push(event),
			registerProvider: vi.fn(),
			sendMessage: vi.fn(),
		} as any;
		openrouterRoutingExtension(pi);
		expect(commands).toEqual(expect.arrayContaining([
			"openrouter-sync",
			"openrouter-enrich",
			"openrouter-preview",
			"openrouter-balance",
			"openrouter-status",
		]));
		expect(events).toEqual(expect.arrayContaining(["context", "session_start"]));
	});

	it("session start is silent without key", async () => {
		const handlers: Record<string, any> = {};
		const pi = {
			registerCommand: vi.fn(),
			on: (event: string, handler: any) => { handlers[event] = handler; },
			registerProvider: vi.fn(),
			sendMessage: vi.fn(),
		} as any;
		openrouterRoutingExtension(pi);
		await handlers.session_start({}, { modelRegistry: { getApiKeyForProvider: vi.fn(async () => undefined) }, ui: { setStatus: vi.fn(), notify: vi.fn() } });
		expect(pi.registerProvider).not.toHaveBeenCalled();
	});

	it("preview and balance emit info messages", async () => {
		vi.mocked(fetchModels).mockResolvedValue([{ id: "openai/gpt-4o", name: "GPT-4o", pricing: {} }] as any);
		vi.mocked(fetchModelEndpoints).mockResolvedValue([{ provider_name: "OpenAI", status: 0 }] as any);
		vi.mocked(fetchKeyInfo).mockResolvedValue({ limit_remaining: 5 } as any);
		vi.mocked(fetchCredits).mockResolvedValue({ total_credits: 10, total_usage: 3 } as any);
		const commands: Record<string, any> = {};
		const pi = {
			registerCommand: (name: string, config: any) => { commands[name] = config; },
			on: vi.fn(),
			registerProvider: vi.fn(),
			sendMessage: vi.fn(),
		} as any;
		openrouterRoutingExtension(pi);
		const ctx = { modelRegistry: { getApiKeyForProvider: vi.fn(async () => "key") }, ui: { notify: vi.fn(), setStatus: vi.fn(), custom: vi.fn() } };
		await commands["openrouter-preview"].handler("openai/gpt-4o", ctx);
		await commands["openrouter-balance"].handler("", ctx);
		expect(pi.sendMessage).toHaveBeenCalled();
	});
});
