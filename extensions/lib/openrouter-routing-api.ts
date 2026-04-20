// ABOUTME: OpenRouter API client and cache helpers for the routing extension.
// ABOUTME: Fetches models, endpoints, key info, and credits with TTL-based caching and actionable errors.

import {
	OPENROUTER_MODELS_URL,
	OPENROUTER_BASE_URL,
	OPENROUTER_CACHE_TTL_MS,
	OPENROUTER_FETCH_TIMEOUT_MS,
	type OpenRouterModel,
	type OpenRouterEndpoint,
	type OpenRouterEndpointsResponse,
	type OpenRouterKeyInfo,
	type OpenRouterCreditsInfo,
	type OpenRouterEndpointCacheEntry,
} from "./openrouter-routing-types.ts";

let cachedModels: OpenRouterModel[] | null = null;
let cacheTimestamp = 0;
let cachedApiKeyHash = "";
const endpointCache = new Map<string, OpenRouterEndpointCacheEntry>();

function hashKey(key?: string): string {
	if (!key) return "";
	if (key.length <= 12) return key;
	return key.slice(0, 8) + key.slice(-4);
}

function makeHeaders(apiKey?: string): Record<string, string> {
	const headers: Record<string, string> = {};
	if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
	return headers;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), OPENROUTER_FETCH_TIMEOUT_MS);
	try {
		return await fetch(url, { ...options, signal: controller.signal });
	} finally {
		clearTimeout(timeout);
	}
}

function formatFetchError(res: Response, context: string): Error {
	const status = res.status;
	let hint = "";
	if (status === 401 || status === 403) {
		hint = " — check your OpenRouter API key";
	} else if (status === 429) {
		hint = " — rate limited, try again shortly";
	} else if (status >= 500) {
		hint = " — OpenRouter is having issues, try again later";
	}
	return new Error(`${context}: ${status} ${res.statusText}${hint}`);
}

function ensureArray<T>(value: unknown): T[] {
	return Array.isArray(value) ? (value as T[]) : [];
}

export function invalidateModelCache(): void {
	cachedModels = null;
	cacheTimestamp = 0;
}

export function invalidateEndpointCache(modelId?: string): void {
	if (modelId) endpointCache.delete(modelId);
	else endpointCache.clear();
}

export function invalidateAllCaches(): void {
	invalidateModelCache();
	invalidateEndpointCache();
}

export function getCachedModels(): OpenRouterModel[] | null {
	return cachedModels;
}

export function getCacheAgeMs(): number | null {
	if (!cacheTimestamp) return null;
	return Math.max(0, Date.now() - cacheTimestamp);
}

export async function fetchModels(apiKey?: string, force = false): Promise<OpenRouterModel[]> {
	const keyHash = hashKey(apiKey);
	if (keyHash !== cachedApiKeyHash) {
		cachedModels = null;
		cacheTimestamp = 0;
		cachedApiKeyHash = keyHash;
	}

	const now = Date.now();
	if (!force && cachedModels && now - cacheTimestamp < OPENROUTER_CACHE_TTL_MS) {
		return cachedModels;
	}

	const res = await fetchWithTimeout(OPENROUTER_MODELS_URL, {
		headers: makeHeaders(apiKey),
	});
	if (!res.ok) throw formatFetchError(res, "OpenRouter models API");

	const json = await res.json() as { data?: unknown };
	const models = ensureArray<OpenRouterModel>(json.data);
	cachedModels = models;
	cacheTimestamp = now;
	return models;
}

function buildEndpointsUrl(modelId: string): string {
	const path = modelId.split("/").map((part) => encodeURIComponent(part)).join("/");
	return `${OPENROUTER_BASE_URL}/models/${path}/endpoints`;
}

export async function fetchModelEndpoints(modelId: string, apiKey?: string, force = false): Promise<OpenRouterEndpoint[]> {
	const cached = endpointCache.get(modelId);
	const now = Date.now();
	if (!force && cached && now - cached.timestamp < OPENROUTER_CACHE_TTL_MS) {
		return cached.endpoints;
	}

	const res = await fetchWithTimeout(buildEndpointsUrl(modelId), {
		headers: makeHeaders(apiKey),
	});
	if (res.status === 404) {
		endpointCache.set(modelId, { timestamp: now, endpoints: [] });
		return [];
	}
	if (!res.ok) throw formatFetchError(res, "OpenRouter endpoints API");

	const json = await res.json() as OpenRouterEndpointsResponse;
	const endpoints = ensureArray<OpenRouterEndpoint>(json.data?.endpoints);
	endpointCache.set(modelId, { timestamp: now, endpoints });
	return endpoints;
}

export async function fetchKeyInfo(apiKey: string): Promise<OpenRouterKeyInfo> {
	const res = await fetchWithTimeout(`${OPENROUTER_BASE_URL}/key`, {
		headers: makeHeaders(apiKey),
	});
	if (!res.ok) throw formatFetchError(res, "OpenRouter key API");

	const json = await res.json() as { data?: OpenRouterKeyInfo };
	return json.data || {};
}

export async function fetchCredits(apiKey: string): Promise<OpenRouterCreditsInfo | null> {
	try {
		const res = await fetchWithTimeout(`${OPENROUTER_BASE_URL}/credits`, {
			headers: makeHeaders(apiKey),
		});
		if (!res.ok) return null;
		const json = await res.json() as { data?: OpenRouterCreditsInfo };
		return json.data || null;
	} catch {
		return null;
	}
}
