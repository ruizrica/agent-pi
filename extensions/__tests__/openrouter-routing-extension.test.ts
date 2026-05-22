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

	it("registers the openrouter-sync command", () => {
		const pi = {
			on: vi.fn(),
			registerProvider: vi.fn(),
			registerCommand: vi.fn(),
			sendMessage: vi.fn(),
		};

		openrouterRoutingExtension(pi);
		const calls = pi.registerCommand.mock.calls;
		expect(calls.some((call: any) => call[0] === "openrouter-sync")).toBe(true);
	});

	it("registers the openrouter-enrich command", () => {
		const pi = {
			on: vi.fn(),
			registerProvider: vi.fn(),
			registerCommand: vi.fn(),
			sendMessage: vi.fn(),
		};

		openrouterRoutingExtension(pi);
		const calls = pi.registerCommand.mock.calls;
		expect(calls.some((call: any) => call[0] === "openrouter-enrich")).toBe(true);
	});

	it("registers the openrouter-preview command", () => {
		const pi = {
			on: vi.fn(),
			registerProvider: vi.fn(),
			registerCommand: vi.fn(),
			sendMessage: vi.fn(),
		};

		openrouterRoutingExtension(pi);
		const calls = pi.registerCommand.mock.calls;
		expect(calls.some((call: any) => call[0] === "openrouter-preview")).toBe(true);
	});

	it("registers the openrouter-balance command", () => {
		const pi = {
			on: vi.fn(),
			registerProvider: vi.fn(),
			registerCommand: vi.fn(),
			sendMessage: vi.fn(),
		};

		openrouterRoutingExtension(pi);
		const calls = pi.registerCommand.mock.calls;
		expect(calls.some((call: any) => call[0] === "openrouter-balance")).toBe(true);
	});

	it("registers the openrouter-status command", () => {
		const pi = {
			on: vi.fn(),
			registerProvider: vi.fn(),
			registerCommand: vi.fn(),
			sendMessage: vi.fn(),
		};

		openrouterRoutingExtension(pi);
		const calls = pi.registerCommand.mock.calls;
		expect(calls.some((call: any) => call[0] === "openrouter-status")).toBe(true);
	});
});
