// ABOUTME: Types and constants for the OpenRouter routing extension.
// ABOUTME: Defines OpenRouter API response shapes, internal route metadata, and sync snapshot state.

export type OpenRouterInputType = "text" | "image";
export type OpenRouterSyncMode = "plain" | "enriched";

export interface OpenRouterPricing {
	prompt?: string;
	completion?: string;
	request?: string;
	image?: string;
	input_cache_read?: string;
	input_cache_write?: string;
	internal_reasoning?: string;
	web_search?: string;
	discount?: number;
}

export interface OpenRouterArchitecture {
	modality?: string;
	input_modalities?: string[];
	output_modalities?: string[];
	tokenizer?: string;
}

export interface OpenRouterModel {
	id: string;
	name: string;
	description?: string;
	context_length?: number;
	knowledge_cutoff?: string;
	expiration_date?: string;
	top_provider?: { max_completion_tokens?: number; is_moderated?: boolean };
	pricing?: OpenRouterPricing;
	architecture?: OpenRouterArchitecture;
	supported_parameters?: string[];
	default_parameters?: Record<string, unknown>;
	per_request_limits?: { prompt_tokens?: number; completion_tokens?: number } | null;
}

export interface PercentileStats {
	p50: number;
	p75: number;
	p90: number;
	p99: number;
}

export interface OpenRouterEndpoint {
	name?: string;
	provider_name?: string;
	tag?: string;
	quantization?: string;
	context_length?: number;
	max_completion_tokens?: number;
	max_prompt_tokens?: number;
	pricing?: OpenRouterPricing;
	supported_parameters?: string[];
	status?: number;
	uptime_last_30m?: number;
	latency_last_30m?: PercentileStats | null;
	throughput_last_30m?: PercentileStats | null;
	supports_implicit_caching?: boolean;
}

export interface OpenRouterEndpointsResponse {
	data?: {
		id?: string;
		name?: string;
		endpoints?: OpenRouterEndpoint[];
	};
}

export interface OpenRouterKeyInfo {
	label?: string;
	limit?: number | null;
	limit_remaining?: number | null;
	limit_reset?: string | null;
	usage?: number;
	usage_daily?: number;
	usage_weekly?: number;
	usage_monthly?: number;
	is_free_tier?: boolean;
}

export interface OpenRouterCreditsInfo {
	total_credits?: number;
	total_usage?: number;
}

export interface OpenRouterProviderModelConfig {
	id: string;
	name: string;
	reasoning: boolean;
	input: OpenRouterInputType[];
	cost: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
	};
	contextWindow: number;
	maxTokens: number;
}

export interface OpenRouterRouteVariant {
	syntheticId: string;
	baseModelId: string;
	providerSlug: string;
	providerName: string;
	quantization?: string;
	quantizationRaw?: string;
	endpointStatus?: number;
	uptimePct?: number;
	latencyP50?: number;
	throughputP50?: number;
	supportsCaching?: boolean;
}

export interface OpenRouterEndpointGroup {
	route: OpenRouterRouteVariant;
	endpoints: OpenRouterEndpoint[];
}

export interface OpenRouterEnrichedResult {
	variants: OpenRouterProviderModelConfig[];
	routes: Map<string, OpenRouterRouteVariant>;
	variantCount: number;
	endpointFailures: number;
}

export interface OpenRouterSyncSnapshot {
	generation: number;
	models: OpenRouterProviderModelConfig[];
	routes: ReadonlyMap<string, OpenRouterRouteVariant>;
	enrichedModelIds: Set<string>;
	timestamp: number;
	syncMode: OpenRouterSyncMode;
	endpointFailures: number;
	baseModelCount: number;
}

export interface OpenRouterEndpointCacheEntry {
	timestamp: number;
	endpoints: OpenRouterEndpoint[];
}

export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_PROVIDER_NAME = "openrouter";
export const OPENROUTER_CACHE_TTL_MS = 30 * 60 * 1000;
export const OPENROUTER_FETCH_TIMEOUT_MS = 15_000;
export const OPENROUTER_ENRICHED_MODEL_PREFIX = "@or:";
export const OPENROUTER_INFO_MESSAGE_TYPE = "openrouter-info";
export const OPENROUTER_REFERER_HEADER = "https://github.com/ruizrica/agent-pi";
export const OPENROUTER_APP_TITLE = "agent-pi-openrouter-routing";

export const OPENROUTER_ENDPOINT_STATUS_LABELS: Record<number, string> = {
	0: "healthy",
	[-1]: "degraded",
	[-2]: "issues",
	[-3]: "down",
	[-5]: "decommissioned",
	[-10]: "offline",
};
