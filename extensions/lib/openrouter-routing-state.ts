// ABOUTME: In-memory sync snapshot state for the OpenRouter routing extension.
// ABOUTME: Tracks current model inventory, variant routes, sync generations, and cache metadata.

import type { OpenRouterModel } from "./openrouter-routing-types.ts";
import type {
	OpenRouterProviderModelConfig,
	OpenRouterRouteVariant,
	OpenRouterSyncSnapshot,
} from "./openrouter-routing-types.ts";
import { toProviderModel, enrichModel } from "./openrouter-routing-models.ts";
import { fetchModels, getCachedModels } from "./openrouter-routing-api.ts";

let currentSnapshot: OpenRouterSyncSnapshot = {
	generation: 0,
	models: [],
	routes: new Map(),
	enrichedModelIds: new Set(),
	timestamp: 0,
	syncMode: "plain",
	endpointFailures: 0,
	baseModelCount: 0,
};

let syncGeneration = 0;

export interface OpenRouterPlainSyncResult {
	models: OpenRouterProviderModelConfig[];
	routes: ReadonlyMap<string, OpenRouterRouteVariant>;
	modelCount: number;
	syncMode: "plain";
	endpointFailures: number;
	baseModelCount: number;
}

export interface OpenRouterEnrichSyncResult {
	models: OpenRouterProviderModelConfig[];
	routes: ReadonlyMap<string, OpenRouterRouteVariant>;
	enrichedModelIds: Set<string>;
	modelCount: number;
	variantCount: number;
	endpointFailures: number;
	baseModelCount: number;
	syncMode: "enriched";
}

export function getSnapshot(): OpenRouterSyncSnapshot {
	return currentSnapshot;
}

export function getGeneration(): number {
	return syncGeneration;
}

export function nextGeneration(): number {
	return ++syncGeneration;
}

export function isStale(generation: number): boolean {
	return generation !== syncGeneration;
}

export async function buildPlainSync(apiKey?: string, force?: boolean): Promise<OpenRouterPlainSyncResult> {
	const rawModels = await fetchModels(apiKey, force);
	const models = rawModels.map(toProviderModel);
	return {
		models,
		routes: new Map(),
		modelCount: models.length,
		syncMode: "plain",
		endpointFailures: 0,
		baseModelCount: models.length,
	};
}

export async function buildEnrichedSync(targetModelId: string, apiKey?: string, force?: boolean): Promise<OpenRouterEnrichSyncResult> {
	const rawModels = await fetchModels(apiKey, force);
	const baseModels = rawModels.map(toProviderModel);
	const routes = new Map<string, OpenRouterRouteVariant>();
	const enrichedModelIds = new Set<string>();
	const enriched = await enrichModel(rawModels, targetModelId, apiKey);
	for (const [key, route] of enriched.routes) routes.set(key, route);
		enrichedModelIds.add(targetModelId);

	return {
		models: [...baseModels, ...enriched.variants],
		routes,
		enrichedModelIds,
		modelCount: baseModels.length,
		variantCount: routes.size,
		endpointFailures: enriched.endpointFailures,
		baseModelCount: baseModels.length,
		syncMode: "enriched",
	};
}

export function commitSnapshot(
	generation: number,
	models: OpenRouterProviderModelConfig[],
	routes: ReadonlyMap<string, OpenRouterRouteVariant>,
	options?: {
		enrichedModelIds?: Set<string>;
		syncMode?: "plain" | "enriched";
		endpointFailures?: number;
		baseModelCount?: number;
	},
): boolean {
	if (isStale(generation)) return false;
	currentSnapshot = {
		generation,
		models,
		routes,
		enrichedModelIds: options?.enrichedModelIds || new Set(),
		timestamp: Date.now(),
		syncMode: options?.syncMode || "plain",
		endpointFailures: options?.endpointFailures || 0,
		baseModelCount: options?.baseModelCount || models.length,
	};
	return true;
}

export function getCachedModelList(): OpenRouterModel[] | null {
	return getCachedModels();
}
