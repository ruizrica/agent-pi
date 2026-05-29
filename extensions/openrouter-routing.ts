// ABOUTME: OpenRouter routing extension — syncs the OpenRouter catalog and exposes provider/quantization variants.
// ABOUTME: Registers the openrouter provider, session-start sync, and commands for sync, enrich, preview, balance, and status.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { visibleWidth, fuzzyFilter, matchesKey, decodeKittyPrintable } from "@earendil-works/pi-tui";
import type { Component, Focusable } from "@earendil-works/pi-tui";
import {
	streamSimpleOpenAICompletions,
	type Api,
	type AssistantMessageEventStream,
	type Context,
	type Model,
	type SimpleStreamOptions,
} from "@earendil-works/pi-ai";

// ── Inlined from openrouter-routing-types.ts ──

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
export const OPENROUTER_REFERER_HEADER = "https://github.com/earendil-works/pi";
export const OPENROUTER_APP_TITLE = "agent-pi-openrouter-routing";

export const OPENROUTER_ENDPOINT_STATUS_LABELS: Record<number, string> = {
	0: "healthy",
	[-1]: "degraded",
	[-2]: "issues",
	[-3]: "down",
	[-5]: "decommissioned",
	[-10]: "offline",
};

// ── Inlined from openrouter-routing-api.ts ──

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

function invalidateModelCache(): void {
	cachedModels = null;
	cacheTimestamp = 0;
}

function invalidateEndpointCache(modelId?: string): void {
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

// ── Inlined from openrouter-routing-models.ts ──

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

// ── Inlined from openrouter-routing-provider.ts ──

function createStreamFactoryImpl(routes: ReadonlyMap<string, OpenRouterRouteVariant>) {
	return function streamOpenRouter(
		model: Model<Api>,
		context: Context,
		options?: SimpleStreamOptions,
	): AssistantMessageEventStream {
		const route = routes.get(model.id);

		if (!route) {
			if (model.id.startsWith(OPENROUTER_ENRICHED_MODEL_PREFIX)) {
				throw new Error(
					`Selected OpenRouter variant "${model.id}" is stale. Run /openrouter-enrich to refresh or /openrouter-sync to restore the plain list.`,
				);
			}
			return streamSimpleOpenAICompletions(model as Model<"openai-completions">, context, options);
		}

		return streamSimpleOpenAICompletions(model as Model<"openai-completions">, context, {
			...options,
			onPayload: async (payload, payloadModel) => {
				let nextPayload = payload;
				if (options?.onPayload) {
					const userPayload = await options.onPayload(payload, payloadModel);
					if (userPayload !== undefined) nextPayload = userPayload;
				}

				if (!nextPayload || typeof nextPayload !== "object" || Array.isArray(nextPayload)) {
					return nextPayload;
				}

				const record = nextPayload as Record<string, unknown>;
				const existingProvider =
					record.provider && typeof record.provider === "object" && !Array.isArray(record.provider)
						? { ...(record.provider as Record<string, unknown>) }
						: {};

				existingProvider.only = [route.providerSlug];
				existingProvider.allow_fallbacks = false;
				if (route.quantizationRaw) existingProvider.quantizations = [route.quantizationRaw];
				else if (route.quantization) existingProvider.quantizations = [route.quantization];

				return {
					...record,
					model: route.baseModelId,
					provider: existingProvider,
				};
			},
		});
	};
}

export function createStreamFactory(routes: ReadonlyMap<string, OpenRouterRouteVariant>) {
	return createStreamFactoryImpl(routes);
}

// ── Inlined from openrouter-routing-picker.ts ──

const VIEWPORT_ROWS = 10;
const SUMMARY_ROWS = 2;

function stripAnsi(text: string): string {
	return text.replace(/\x1b\[[0-9;]*m/g, "").replace(/\x1b_[^\x07]*\x07/g, "");
}

function pad(text: string, len: number): string {
	return text + " ".repeat(Math.max(0, len - visibleWidth(stripAnsi(text))));
}

function truncateVisible(text: string, width: number): string {
	if (width <= 0) return "";
	const normalized = sanitizeText(text);
	const plain = stripAnsi(normalized);
	if (visibleWidth(plain) <= width) return normalized;
	const target = Math.max(1, width - 1);
	let out = "";
	for (const ch of plain) {
		if (visibleWidth(out + ch) > target) break;
		out += ch;
	}
	return out + "…";
}

function row(theme: any, width: number, content = ""): string {
	const inner = Math.max(1, width - 2);
	const clipped = truncateVisible(content, inner);
	return `${theme.fg("border", "│")}${pad(clipped, inner)}${theme.fg("border", "│")}`;
}

function header(theme: any, width: number, text: string): string {
	const inner = Math.max(1, width - 2);
	const clipped = truncateVisible(text, inner);
	const padLen = Math.max(0, inner - visibleWidth(stripAnsi(clipped)));
	const left = Math.floor(padLen / 2);
	const right = padLen - left;
	return theme.fg("border", "╭" + "─".repeat(left)) + theme.fg("accent", clipped) + theme.fg("border", "─".repeat(right) + "╮");
}

function footer(theme: any, width: number, text: string): string {
	const inner = Math.max(1, width - 2);
	const clipped = truncateVisible(text, inner);
	const padLen = Math.max(0, inner - visibleWidth(stripAnsi(clipped)));
	const left = Math.floor(padLen / 2);
	const right = padLen - left;
	return theme.fg("border", "╰" + "─".repeat(left)) + theme.fg("dim", clipped) + theme.fg("border", "─".repeat(right) + "╯");
}

function wrapSummary(text: string, maxWidth: number, lines: number): string[] {
	const result: string[] = [];
	let remaining = sanitizeText(text);
	for (let i = 0; i < lines; i++) {
		if (!remaining) {
			result.push("");
			continue;
		}
		if (visibleWidth(remaining) <= maxWidth) {
			result.push(remaining);
			remaining = "";
			continue;
		}
		if (i === lines - 1) {
			result.push(truncateVisible(remaining, maxWidth));
			remaining = "";
			continue;
		}
		let cut = Math.min(remaining.length, maxWidth);
		const slice = remaining.slice(0, cut);
		const lastSpace = slice.lastIndexOf(" ");
		if (lastSpace > Math.floor(maxWidth / 3)) cut = lastSpace;
		result.push(remaining.slice(0, cut).trimEnd());
		remaining = remaining.slice(cut).trimStart();
	}
	return result;
}

function printableInput(data: string): string | undefined {
	const kitty = decodeKittyPrintable(data);
	if (kitty !== undefined) return kitty;
	if (data.length === 1) {
		const code = data.charCodeAt(0);
		if (code >= 32 && code !== 127) return data;
	}
	return undefined;
}

export class ModelPickerComponent implements Focusable {
	focused = false;
	private readonly tui: any;
	private readonly theme: any;
	private readonly done: (result: string | null) => void;
	private readonly title: string;
	private readonly allModels: OpenRouterModel[];
	private filteredModels: OpenRouterModel[];
	private query = "";
	private selectedIndex = 0;

	constructor(tui: any, theme: any, _keybindings: any, done: (result: string | null) => void, models: OpenRouterModel[], title: string) {
		this.tui = tui;
		this.theme = theme;
		this.done = done;
		this.title = title;
		this.allModels = sortModels(models);
		this.filteredModels = this.allModels;
		this.tui?.setShowHardwareCursor?.(false);
		this.tui?.setClearOnShrink?.(true);
		this.tui?.invalidate?.();
		this.tui?.requestRender?.(true);
	}

	private updateFilter(): void {
		this.filteredModels = rankModelsForQuery(this.allModels, this.query);
		this.selectedIndex = this.filteredModels.length === 0 ? 0 : Math.min(this.selectedIndex, this.filteredModels.length - 1);
	}

	private move(delta: number): void {
		if (this.filteredModels.length === 0) return;
		const len = this.filteredModels.length;
		this.selectedIndex = (this.selectedIndex + delta + len) % len;
	}

	private confirm(): void {
		const selected = this.filteredModels[this.selectedIndex];
		if (selected) this.done(selected.id);
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.done(null);
			return;
		}
		if (matchesKey(data, "return") || matchesKey(data, "enter")) {
			this.confirm();
			return;
		}
		if (matchesKey(data, "up") || matchesKey(data, "ctrl+p")) {
			this.move(-1);
			this.tui.invalidate?.();
			return;
		}
		if (matchesKey(data, "down") || matchesKey(data, "ctrl+n")) {
			this.move(1);
			this.tui.invalidate?.();
			return;
		}
		if (matchesKey(data, "backspace")) {
			this.query = this.query.slice(0, -1);
			this.updateFilter();
			this.tui.invalidate?.();
			return;
		}
		const printable = printableInput(data);
		if (printable) {
			this.query += printable;
			this.updateFilter();
			this.tui.invalidate?.();
		}
	}

	render(width: number): string[] {
		const innerWidth = Math.max(24, width);
		const selected = this.filteredModels[this.selectedIndex];
		const summaryText = selected?.description || selected?.name || selected?.id || "No results";
		const lines = [header(this.theme, innerWidth, this.title), row(this.theme, innerWidth, `Search: ${this.query || ""}`)];
		const start = Math.max(0, this.selectedIndex - Math.floor(VIEWPORT_ROWS / 2));
		const visible = this.filteredModels.slice(start, start + VIEWPORT_ROWS);
		for (const model of visible) {
			const isSelected = model === selected;
			const prefix = isSelected ? this.theme.fg("accent", "› ") : "  ";
			lines.push(row(this.theme, innerWidth, `${prefix}${model.id}`));
		}
		while (lines.length < 2 + VIEWPORT_ROWS) lines.push(row(this.theme, innerWidth, ""));
		for (const summaryLine of wrapSummary(summaryText, Math.max(1, innerWidth - 2), SUMMARY_ROWS)) {
			lines.push(row(this.theme, innerWidth, summaryLine));
		}
		lines.push(footer(this.theme, innerWidth, `${this.filteredModels.length} models • Enter select • Esc cancel`));
		return lines;
	}
}

export function createModelPicker(tui: any, theme: any, keybindings: any, done: (result: string | null) => void, models: OpenRouterModel[], title: string) {
	return new ModelPickerComponent(tui, theme, keybindings, done, models, title);
}

// ── Inlined from openrouter-routing-state.ts ──

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

// ── Main Extension ──

function emitMessage(pi: ExtensionAPI, text: string) {
	pi.sendMessage({ customType: OPENROUTER_INFO_MESSAGE_TYPE, content: text, display: true });
}

function sanitizeSearchText(text?: string): string {
	return (text || "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

function maxDefinedInExt(values: Array<number | undefined>, fallback?: number): number | undefined {
	const defined = values.filter((v): v is number => v !== undefined);
	if (defined.length > 0) return Math.max(...defined);
	return fallback;
}

function formatPerMillion(cost: number): string {
	if (cost === 0) return "$0/M";
	if (cost < 0.01) return `$${cost.toFixed(4)}/M`;
	if (cost < 1) return `$${cost.toFixed(3)}/M`;
	return `$${cost.toFixed(2)}/M`;
}

function buildPricingParts(input?: number, output?: number, cacheRead?: number, cacheWrite?: number): string[] {
	const parts: string[] = [];
	if (input !== undefined) parts.push(`${formatPerMillion(input)} in`);
	if (output !== undefined) parts.push(`${formatPerMillion(output)} out`);
	if (cacheRead !== undefined) parts.push(`${formatPerMillion(cacheRead)} cache-read`);
	if (cacheWrite !== undefined) parts.push(`${formatPerMillion(cacheWrite)} cache-write`);
	return parts;
}

function buildPreviewSearchInfo(target: { id: string; name: string; description?: string; pricing?: { prompt?: string; completion?: string; input_cache_read?: string; input_cache_write?: string } }): string[] {
	const tokenizedId = target.id.replace(/[/:_.-]+/g, " ");
	const terms = Array.from(new Set([target.id, tokenizedId, target.name].map(sanitizeSearchText).filter(Boolean)));
	const lines = ["**Search info**", `- Searchable id: ${target.id}`, `- Searchable name: ${target.name}`];
	if (terms.length > 0) lines.push(`- Search terms: ${terms.join(" | ")}`);
	const basePricing = buildPricingParts(parseCost(target.pricing?.prompt), parseCost(target.pricing?.completion), parseCost(target.pricing?.input_cache_read), parseCost(target.pricing?.input_cache_write));
	if (basePricing.length > 0) lines.push(`- Base pricing: ${basePricing.join(" · ")}`);
	if (target.description) lines.push(`- Description: ${sanitizeSearchText(target.description)}`);
	return lines;
}

function buildVariantPricingInfo(target: { pricing?: { prompt?: string; completion?: string; input_cache_read?: string; input_cache_write?: string } }, endpoints: Array<{ pricing?: { prompt?: string; completion?: string; input_cache_read?: string; input_cache_write?: string } }>): string {
	const input = maxDefinedInExt(endpoints.map((e) => parseCost(e.pricing?.prompt)), parseCost(target.pricing?.prompt));
	const output = maxDefinedInExt(endpoints.map((e) => parseCost(e.pricing?.completion)), parseCost(target.pricing?.completion));
	const cacheRead = maxDefinedInExt(endpoints.map((e) => parseCost(e.pricing?.input_cache_read)), parseCost(target.pricing?.input_cache_read));
	const cacheWrite = maxDefinedInExt(endpoints.map((e) => parseCost(e.pricing?.input_cache_write)), parseCost(target.pricing?.input_cache_write));
	return buildPricingParts(input, output, cacheRead, cacheWrite).join(" · ");
}

export default function openrouterRoutingExtension(pi: ExtensionAPI) {
	pi.on("context", async (event) => ({
		messages: event.messages.filter((message: any) => !(message.role === "custom" && message.customType === OPENROUTER_INFO_MESSAGE_TYPE)),
	}));

	function registerWithSnapshot(models: OpenRouterProviderModelConfig[], routes: ReadonlyMap<string, OpenRouterRouteVariant>) {
		pi.registerProvider(OPENROUTER_PROVIDER_NAME, {
			baseUrl: OPENROUTER_BASE_URL,
			apiKey: "$OPENROUTER_API_KEY",
			api: "openai-completions",
			models,
			headers: {
				"HTTP-Referer": OPENROUTER_REFERER_HEADER,
				"X-Title": OPENROUTER_APP_TITLE,
			},
			streamSimple: createStreamFactoryImpl(routes),
		});
	}

	async function syncPlain(ctx: any, silent = false, force = false) {
		const generation = nextGeneration();
		try {
			const apiKey = await ctx.modelRegistry.getApiKeyForProvider(OPENROUTER_PROVIDER_NAME);
			if (!silent) ctx.ui.notify("Fetching OpenRouter models...", "info");
			const result = await buildPlainSync(apiKey, force);
			if (isStale(generation)) return;
			commitSnapshot(generation, result.models, result.routes, {
				syncMode: result.syncMode,
				endpointFailures: result.endpointFailures,
				baseModelCount: result.baseModelCount,
			});
			registerWithSnapshot(result.models, result.routes);
			if (!silent) ctx.ui.notify(`OpenRouter: ${result.modelCount} models synced`, "info");
		} catch (err: any) {
			if (!silent) ctx.ui.notify(`OpenRouter sync failed: ${err?.message}`, "error");
		}
	}

	async function syncEnriched(ctx: any, targetModelId: string) {
		const generation = nextGeneration();
		try {
			const apiKey = await ctx.modelRegistry.getApiKeyForProvider(OPENROUTER_PROVIDER_NAME);
			ctx.ui.notify(`Fetching endpoint variants for ${targetModelId}...`, "info");
			const result = await buildEnrichedSync(targetModelId, apiKey, false);
			if (isStale(generation)) return;
			commitSnapshot(generation, result.models, result.routes, {
				enrichedModelIds: result.enrichedModelIds,
				syncMode: result.syncMode,
				endpointFailures: result.endpointFailures,
				baseModelCount: result.baseModelCount,
			});
			registerWithSnapshot(result.models, result.routes);
			const failuresText = result.endpointFailures > 0 ? `, ${result.endpointFailures} endpoint failures` : "";
			ctx.ui.notify(`OpenRouter: ${result.models.length} models registered (${result.variantCount} variants)${failuresText}`, "info");
		} catch (err: any) {
			ctx.ui.notify(`OpenRouter enrich failed: ${err?.message}`, "error");
		}
	}

	function modelCompletions(prefix: string) {
		const cached = getCachedModelList();
		if (!cached) return null;
		const ranked = rankModelsForQuery(cached, prefix.trim());
		return ranked.slice(0, 20).map((m) => ({ value: m.id, label: m.id, description: m.name }));
	}

	async function pickModel(ctx: any, title: string): Promise<string | undefined> {
		const cached = getCachedModelList();
		if (!cached || cached.length === 0) {
			ctx.ui.notify("No models cached. Run /openrouter-sync first.", "warning");
			return undefined;
		}
		const result = await ctx.ui.custom((tui: any, theme: any, keybindings: any, done: (result: string | null) => void) => createModelPicker(tui, theme, keybindings, done, cached, title), {
			overlay: true,
			overlayOptions: { width: "80%", maxHeight: "70%", row: "14%", col: "50%", minWidth: 60 },
		});
		return result || undefined;
	}

	pi.on("session_start", async (_event, ctx) => {
		try {
			const apiKey = await ctx.modelRegistry.getApiKeyForProvider(OPENROUTER_PROVIDER_NAME);
			if (apiKey) {
				await syncPlain(ctx, true, true);
				updateStatusBar(ctx);
			}
		} catch {
			// No auth configured
		}
	});

	pi.registerCommand("openrouter-sync", {
		description: "Fetch latest OpenRouter models and restore the plain model list",
		handler: async (_args, ctx) => {
			invalidateAllCaches();
			await syncPlain(ctx, false, true);
			updateStatusBar(ctx);
		},
	});

	pi.registerCommand("openrouter-enrich", {
		description: "Add provider/quantization variants for a model",
		getArgumentCompletions: modelCompletions,
		handler: async (args, ctx) => {
			const modelId = args.trim();
			if (!modelId) {
				const picked = await pickModel(ctx, "Search models to enrich");
				if (!picked) return;
				await syncEnriched(ctx, picked);
				updateStatusBar(ctx);
				return;
			}
			await syncEnriched(ctx, modelId);
			updateStatusBar(ctx);
		},
	});

	pi.registerCommand("openrouter-preview", {
		description: "Preview provider/quantization variants for a model without changing the model list",
		getArgumentCompletions: modelCompletions,
		handler: async (args, ctx) => {
			let modelId = args.trim();
			if (!modelId) {
				const picked = await pickModel(ctx, "Search models to preview");
				if (!picked) return;
				modelId = picked;
			}
			try {
				const apiKey = await ctx.modelRegistry.getApiKeyForProvider(OPENROUTER_PROVIDER_NAME);
				ctx.ui.notify(`Fetching endpoints for ${modelId}...`, "info");
				const models = await fetchModels(apiKey);
				const target = models.find((m) => m.id === modelId);
				if (!target) {
					ctx.ui.notify(`Model not found: ${modelId}`, "error");
					return;
				}
				const endpoints = await fetchModelEndpoints(modelId, apiKey, true);
				if (endpoints.length === 0) {
					ctx.ui.notify(`No endpoints found for ${modelId}`, "warning");
					return;
				}
				const groups = groupEndpoints(target, endpoints);
				const lines: string[] = [`**${target.name}** (${target.id})`, `${endpoints.length} endpoints across ${groups.length} provider/quantization variants:`, ""];
				lines.push(...buildPreviewSearchInfo(target), "", "**Endpoint variants**", "");
				for (const group of groups) {
					const route = group.route;
					const label = route.quantization ? `${route.providerName} · ${route.quantization}` : route.providerName;
					const pricing = buildVariantPricingInfo(target, group.endpoints);
					const health = formatEndpointHealth(route);
					const details = [pricing, health].filter(Boolean).join(" · ");
					lines.push(`• **${label}**${details ? ` — ${details}` : ""}`);
				}
				emitMessage(pi, lines.join("\n"));
			} catch (err: any) {
				ctx.ui.notify(`Preview failed: ${err?.message}`, "error");
			}
		},
	});

	pi.registerCommand("openrouter-balance", {
		description: "Show your OpenRouter credit balance and usage",
		handler: async (_args, ctx) => {
			try {
				const apiKey = await ctx.modelRegistry.getApiKeyForProvider(OPENROUTER_PROVIDER_NAME);
				if (!apiKey) {
					ctx.ui.notify("No OpenRouter API key configured", "warning");
					return;
				}
				const [info, credits] = await Promise.all([fetchKeyInfo(apiKey), fetchCredits(apiKey)]);
				const lines: string[] = ["**OpenRouter Account**", ""];
				if (credits && credits.total_credits !== undefined && credits.total_usage !== undefined) {
					const balance = credits.total_credits - credits.total_usage;
					lines.push(`Balance: $${balance.toFixed(4)}`);
					lines.push(`Account credits: $${credits.total_credits.toFixed(4)} — Account used: $${credits.total_usage.toFixed(4)}`);
				} else if (info.limit_remaining !== null && info.limit_remaining !== undefined) {
					lines.push(`Remaining key limit: $${info.limit_remaining.toFixed(4)}`);
				}
				lines.push("");
				if (info.is_free_tier) lines.push("Tier: Free");
				if (info.limit !== null && info.limit !== undefined) {
					const resetStr = info.limit_reset ? ` (resets ${info.limit_reset})` : "";
					lines.push(`Key spend limit: $${info.limit.toFixed(2)}${resetStr}`);
				}
				if (info.usage !== undefined || info.usage_daily !== undefined || info.usage_monthly !== undefined) {
					lines.push("", "**Current API key usage**");
					if (info.usage_daily !== undefined) lines.push(`Today: $${info.usage_daily.toFixed(4)}`);
					if (info.usage_monthly !== undefined) lines.push(`This month: $${info.usage_monthly.toFixed(4)}`);
					if (info.usage !== undefined) lines.push(`All-time for this key: $${info.usage.toFixed(4)}`);
				}
				emitMessage(pi, lines.join("\n"));
			} catch (err: any) {
				ctx.ui.notify(`Balance check failed: ${err?.message}`, "error");
			}
		},
	});

	pi.registerCommand("openrouter-status", {
		description: "Show current extension state: synced models, active enrichments, cache age",
		handler: async (_args, _ctx) => {
			const snapshot = getSnapshot();
			const lines: string[] = ["**OpenRouter Extension Status**", ""];
			lines.push(`Models registered: ${snapshot.models.length}`);
			lines.push(`Base models: ${snapshot.baseModelCount}`);
			lines.push(`Variants registered: ${snapshot.routes.size}`);
			lines.push(`Sync mode: ${snapshot.syncMode}`);
			lines.push(`Endpoint failures: ${snapshot.endpointFailures}`);
			if (snapshot.enrichedModelIds.size > 0) lines.push(`Enriched models: ${Array.from(snapshot.enrichedModelIds).join(", ")}`);
			else lines.push("Enriched models: none");
			const ageMs = getCacheAgeMs();
			if (ageMs !== null) lines.push(`Cache age: ${Math.round(ageMs / 60000)} minute(s)`);
			if (snapshot.timestamp > 0) lines.push(`Last sync: ${Math.round((Date.now() - snapshot.timestamp) / 60000)} minute(s) ago`);
			else lines.push("Last sync: never");
			emitMessage(pi, lines.join("\n"));
		},
	});

	function updateStatusBar(ctx: any) {
		const snapshot = getSnapshot();
		if (snapshot.models.length > 0) {
			const variantCount = snapshot.routes.size;
			const enrichLabel = variantCount > 0 ? ` (${variantCount} variants)` : "";
			try {
				ctx.ui.setStatus("openrouter", `OR: ${snapshot.models.length} models${enrichLabel}`);
			} catch {}
		}
	}
}
