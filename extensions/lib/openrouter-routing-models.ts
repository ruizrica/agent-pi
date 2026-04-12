// ABOUTME: Model normalization, ranking, and endpoint grouping for the OpenRouter routing extension.
// ABOUTME: Converts OpenRouter metadata into Pi provider model configs and route variants.

import { fuzzyFilter } from "@mariozechner/pi-tui";
import { fetchModelEndpoints } from "./openrouter-routing-api.ts";
import {
	OPENROUTER_ENRICHED_MODEL_PREFIX,
	OPENROUTER_ENDPOINT_STATUS_LABELS,
	type OpenRouterModel,
	type OpenRouterEndpoint,
	type OpenRouterArchitecture,
	type OpenRouterProviderModelConfig,
	type OpenRouterRouteVariant,
	type OpenRouterEndpointGroup,
	type OpenRouterEnrichedResult,
	type OpenRouterInputType,
} from "./openrouter-routing-types.ts";

const REASONING_ID_PATTERNS = [
	":thinking",
	"-r1",
	"/r1",
	"o1-",
	"o3-",
	"o4-",
	"reasoner",
	"-thinking",
	"qwq-",
	"/qwq",
];

const REASONING_NAME_PATTERNS = ["thinking", "reasoner", "chain-of-thought"];

export function isReasoningModel(model: OpenRouterModel): boolean {
	const id = model.id.toLowerCase();
	const name = (model.name || "").toLowerCase();
	return REASONING_ID_PATTERNS.some((p) => id.includes(p)) || REASONING_NAME_PATTERNS.some((p) => name.includes(p));
}

export function supportsImages(architecture?: OpenRouterArchitecture): boolean {
	if (architecture?.input_modalities) return architecture.input_modalities.includes("image");
	return architecture?.modality?.includes("multimodal") ?? false;
}

export function parseCost(value?: string): number | undefined {
	if (value == null || value === "") return undefined;
	const n = Number(value);
	if (!Number.isFinite(n)) return undefined;
	return n * 1_000_000;
}

function costOrFallback(value: number | undefined, fallback: number): number {
	return value !== undefined ? value : fallback;
}

function maxDefined(values: Array<number | undefined>, fallback: number): number {
	const defined = values.filter((v): v is number => v !== undefined);
	return defined.length > 0 ? Math.max(...defined) : fallback;
}

function minPositive(values: Array<number | undefined>, fallback: number): number {
	const filtered = values.filter((v): v is number => typeof v === "number" && v > 0);
	return filtered.length > 0 ? Math.min(...filtered) : fallback;
}

export function toProviderModel(model: OpenRouterModel): OpenRouterProviderModelConfig {
	return {
		id: model.id,
		name: model.name || model.id,
		reasoning: isReasoningModel(model),
		input: supportsImages(model.architecture) ? (["text", "image"] as OpenRouterInputType[]) : (["text"] as OpenRouterInputType[]),
		cost: {
			input: costOrFallback(parseCost(model.pricing?.prompt), 0),
			output: costOrFallback(parseCost(model.pricing?.completion), 0),
			cacheRead: costOrFallback(parseCost(model.pricing?.input_cache_read), 0),
			cacheWrite: costOrFallback(parseCost(model.pricing?.input_cache_write), 0),
		},
		contextWindow: model.context_length || 128000,
		maxTokens: model.top_provider?.max_completion_tokens || 16384,
	};
}

export function slugifyProvider(value?: string): string {
	return ((value || "unknown-provider").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")) || "unknown-provider";
}

function getProviderSlug(endpoint: OpenRouterEndpoint): string {
	const fromTag = endpoint.tag?.split("/")[0]?.trim().toLowerCase();
	return fromTag || slugifyProvider(endpoint.provider_name);
}

export function createVariantId(baseModelId: string, providerSlug: string, quantization?: string): string {
	const routeLabel = quantization ? `${providerSlug}:${quantization.toLowerCase()}` : providerSlug;
	return `${OPENROUTER_ENRICHED_MODEL_PREFIX}${routeLabel}:${baseModelId}`;
}

function createVariantName(baseName: string, providerName: string, quantization?: string): string {
	return quantization ? `${providerName} · ${quantization} — ${baseName}` : `${providerName} — ${baseName}`;
}

function normalizeQuantizationForGrouping(value?: string): string | undefined {
	const normalized = (value || "").trim().toLowerCase();
	if (!normalized || normalized === "unknown") return undefined;
	return normalized;
}

export function groupEndpoints(base: OpenRouterModel, endpoints: OpenRouterEndpoint[]): OpenRouterEndpointGroup[] {
	const groups = new Map<string, OpenRouterEndpointGroup>();

	for (const endpoint of endpoints) {
		const providerSlug = getProviderSlug(endpoint);
		const providerName = endpoint.provider_name || providerSlug;
		const quantizationNorm = normalizeQuantizationForGrouping(endpoint.quantization);
		const quantizationRaw = endpoint.quantization?.trim() || undefined;
		const syntheticId = createVariantId(base.id, providerSlug, quantizationNorm);
		const key = `${providerSlug}::${quantizationNorm || "default"}`;

		const existing = groups.get(key);
		if (existing) existing.endpoints.push(endpoint);
		else {
			groups.set(key, {
				route: {
					syntheticId,
					baseModelId: base.id,
					providerSlug,
					providerName,
					quantization: quantizationNorm,
					quantizationRaw,
				},
				endpoints: [endpoint],
			});
		}
	}

	for (const group of groups.values()) {
		const best = group.endpoints.reduce((a, b) => ((b.status ?? -99) > (a.status ?? -99) ? b : a));
		group.route.endpointStatus = best.status ?? undefined;
		group.route.uptimePct = best.uptime_last_30m ?? undefined;
		group.route.latencyP50 = best.latency_last_30m?.p50 ?? undefined;
		group.route.throughputP50 = best.throughput_last_30m?.p50 ?? undefined;
		group.route.supportsCaching = group.endpoints.some((e) => e.supports_implicit_caching);
	}

	return Array.from(groups.values()).sort((a, b) => {
		const providerCompare = a.route.providerName.localeCompare(b.route.providerName);
		if (providerCompare !== 0) return providerCompare;
		return (a.route.quantization || "").localeCompare(b.route.quantization || "");
	});
}

function buildVariantModel(base: OpenRouterModel, route: OpenRouterRouteVariant, endpoints: OpenRouterEndpoint[]): OpenRouterProviderModelConfig {
	const fallback = toProviderModel(base);
	return {
		id: route.syntheticId,
		name: createVariantName(fallback.name, route.providerName, route.quantization),
		reasoning: fallback.reasoning,
		input: fallback.input,
		cost: {
			input: maxDefined(endpoints.map((e) => parseCost(e.pricing?.prompt)), fallback.cost.input),
			output: maxDefined(endpoints.map((e) => parseCost(e.pricing?.completion)), fallback.cost.output),
			cacheRead: maxDefined(endpoints.map((e) => parseCost(e.pricing?.input_cache_read)), fallback.cost.cacheRead),
			cacheWrite: maxDefined(endpoints.map((e) => parseCost(e.pricing?.input_cache_write)), fallback.cost.cacheWrite),
		},
		// Preserve the catalog model's canonical context window for enriched variants.
		// Endpoint-specific context lengths can vary by route/provider and should not
		// shrink the selected model's advertised capacity in shared UI usage displays.
		contextWindow: fallback.contextWindow,
		maxTokens: minPositive(endpoints.map((e) => e.max_completion_tokens), fallback.maxTokens),
	};
}

export async function enrichModel(rawModels: OpenRouterModel[], targetModelId: string, apiKey?: string): Promise<OpenRouterEnrichedResult> {
	const target = rawModels.find((m) => m.id === targetModelId);
	if (!target) throw new Error(`Model not found: ${targetModelId}`);

	let endpointFailures = 0;
	let endpoints: OpenRouterEndpoint[] = [];
	try {
		endpoints = await fetchModelEndpoints(targetModelId, apiKey, true);
	} catch {
		endpointFailures++;
	}

	const groups = groupEndpoints(target, endpoints);
	const routes = new Map<string, OpenRouterRouteVariant>();
	const variants: OpenRouterProviderModelConfig[] = [];
	for (const group of groups) {
		routes.set(group.route.syntheticId, group.route);
		variants.push(buildVariantModel(target, group.route, group.endpoints));
	}

	return {
		variants,
		routes,
		variantCount: variants.length,
		endpointFailures,
	};
}

function sanitizeText(text: string): string {
	return text.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

function searchableText(model: OpenRouterModel): string {
	const id = model.id;
	const provider = id.split("/")[0] || "openrouter";
	const tokenizedId = id.replace(/[/:_.-]+/g, " ");
	const name = model.name || "";
	return `${id} ${provider} ${provider}/${id} ${provider} ${id} ${tokenizedId} ${name}`;
}

function sortModels(models: OpenRouterModel[]): OpenRouterModel[] {
	return [...models].sort((a, b) => a.id.localeCompare(b.id));
}

function queryTokens(query: string): string[] {
	return sanitizeText(query).toLowerCase().split(/\s+/).filter(Boolean);
}

function containsAllTokens(text: string, tokens: string[]): boolean {
	const lower = sanitizeText(text).toLowerCase();
	return tokens.every((token) => lower.includes(token));
}

export function rankModelsForQuery(models: OpenRouterModel[], query: string): OpenRouterModel[] {
	const trimmed = sanitizeText(query);
	if (!trimmed) return sortModels(models);

	const tokens = queryTokens(trimmed);
	const sorted = sortModels(models);
	const exactId = sorted.filter((m) => containsAllTokens(m.id, tokens));
	const exactName = sorted.filter((m) => !exactId.includes(m) && containsAllTokens(m.name || "", tokens));
	const exactTokenizedId = sorted.filter((m) => !exactId.includes(m) && !exactName.includes(m) && containsAllTokens(m.id.replace(/[/:_.-]+/g, " "), tokens));
	const remaining = sorted.filter((m) => !exactId.includes(m) && !exactName.includes(m) && !exactTokenizedId.includes(m));
	const fuzzy = fuzzyFilter(remaining, trimmed, searchableText);
	return [...exactId, ...exactName, ...exactTokenizedId, ...fuzzy];
}

export function formatEndpointHealth(route: OpenRouterRouteVariant): string {
	if (route.endpointStatus === undefined) return "";
	const label = OPENROUTER_ENDPOINT_STATUS_LABELS[route.endpointStatus] || `status ${route.endpointStatus}`;
	const parts = [label];
	if (route.uptimePct !== undefined) parts.push(`${route.uptimePct}% uptime`);
	if (route.latencyP50 !== undefined) parts.push(`p50 ${route.latencyP50}ms`);
	return parts.join(" · ");
}
