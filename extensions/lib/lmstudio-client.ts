// ABOUTME: Small LM Studio OpenAI-compatible API client for local model discovery and chat inference.
// ABOUTME: Shared by the LM Studio provider extension, tools, commands, and routing tests.

import type { Model } from "@earendil-works/pi-ai";

export const LMSTUDIO_PROVIDER = "lmstudio";
export const LMSTUDIO_DEFAULT_BASE_URL = "http://127.0.0.1:1234/v1";
export const LMSTUDIO_DEFAULT_GEMMA_MODEL_ID = "google/gemma-4-12b-qat";
export const LMSTUDIO_DEFAULT_QWEN_MODEL_ID = "qwen/qwen3.6-27b";
export const LMSTUDIO_DEFAULT_TIMEOUT_MS = 3000;
export const LMSTUDIO_DEFAULT_CONTEXT_WINDOW = 128000;
export const LMSTUDIO_DEFAULT_MAX_TOKENS = 8192;
export const LMSTUDIO_DEFAULT_API_KEY = "lmstudio";

export interface LmStudioModel {
	id: string;
	object?: string;
	created?: number;
	owned_by?: string;
}

interface LmStudioModelsResponse {
	data?: LmStudioModel[];
}

export interface LmStudioChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface LmStudioFetchOptions {
	baseUrl?: string;
	timeoutMs?: number;
}

export interface LmStudioChatCompletionOptions extends LmStudioFetchOptions {
	model: string;
	messages: LmStudioChatMessage[];
	temperature?: number;
	maxTokens?: number;
}

export interface LmStudioInferenceResult {
	content: string;
	model: string;
	finishReason?: string | null;
	usage?: unknown;
}

export type LmStudioResult<T> =
	| { ok: true; value: T; baseUrl: string }
	| { ok: false; error: string; baseUrl: string; status?: number };

function truncate(value: string, max = 300): string {
	const singleLine = value.replace(/\s+/g, " ").trim();
	return singleLine.length > max ? `${singleLine.slice(0, max - 3)}...` : singleLine;
}

function cleanModelId(modelId: string | undefined | null): string {
	const trimmed = (modelId || "").trim();
	return trimmed.startsWith(`${LMSTUDIO_PROVIDER}/`)
		? trimmed.slice(`${LMSTUDIO_PROVIDER}/`.length)
		: trimmed;
}

export function normalizeLmStudioBaseUrl(input?: string): string {
	let raw = (input || process.env.LMSTUDIO_BASE_URL || LMSTUDIO_DEFAULT_BASE_URL).trim();
	if (!raw) raw = LMSTUDIO_DEFAULT_BASE_URL;
	raw = raw.replace(/\/+$/, "");

	// The screenshot exposes both REST API v1 and OpenAI-compatible endpoints.
	// Provider/inference calls need the OpenAI-compatible /v1 base.
	if (raw.endsWith("/api/v1")) raw = raw.slice(0, -"/api/v1".length);
	if (raw.endsWith("/v1")) return raw;
	return `${raw}/v1`;
}

export function lmStudioModelsUrl(baseUrl?: string): string {
	return `${normalizeLmStudioBaseUrl(baseUrl)}/models`;
}

export function lmStudioChatCompletionsUrl(baseUrl?: string): string {
	return `${normalizeLmStudioBaseUrl(baseUrl)}/chat/completions`;
}

function authHeaders(): Record<string, string> {
	const apiKey = process.env.LMSTUDIO_API_KEY || LMSTUDIO_DEFAULT_API_KEY;
	return apiKey ? { authorization: `Bearer ${apiKey}` } : {};
}

async function fetchJson<T>(
	url: string,
	baseUrl: string,
	init: RequestInit,
	timeoutMs: number,
): Promise<LmStudioResult<T>> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), Math.max(500, timeoutMs));
	try {
		const res = await fetch(url, {
			...init,
			signal: controller.signal,
			headers: {
				accept: "application/json",
				...(init.body ? { "content-type": "application/json" } : {}),
				...authHeaders(),
				...(init.headers || {}),
			},
		});

		if (!res.ok) {
			const body = await res.text().catch(() => "");
			return {
				ok: false,
				baseUrl,
				status: res.status,
				error: `LM Studio API returned HTTP ${res.status}${body ? `: ${truncate(body)}` : ""}`,
			};
		}

		const json = await res.json().catch(() => null) as T | null;
		if (!json || typeof json !== "object") {
			return { ok: false, baseUrl, error: "LM Studio API returned an empty or invalid JSON response" };
		}
		return { ok: true, baseUrl, value: json };
	} catch (err: any) {
		const reason = err?.name === "AbortError"
			? `timed out after ${Math.max(500, timeoutMs)}ms`
			: (err?.message || String(err));
		return {
			ok: false,
			baseUrl,
			error: `LM Studio server not reachable at ${baseUrl} (${reason}). Toggle LM Studio Local Server on and try again.`,
		};
	} finally {
		clearTimeout(timer);
	}
}

export async function fetchLmStudioModels(options: LmStudioFetchOptions = {}): Promise<LmStudioResult<LmStudioModel[]>> {
	const baseUrl = normalizeLmStudioBaseUrl(options.baseUrl);
	const result = await fetchJson<LmStudioModelsResponse>(
		`${baseUrl}/models`,
		baseUrl,
		{ method: "GET" },
		options.timeoutMs ?? LMSTUDIO_DEFAULT_TIMEOUT_MS,
	);
	if (!result.ok) return result;

	const models = Array.isArray(result.value.data)
		? result.value.data.filter((model): model is LmStudioModel => typeof model?.id === "string" && model.id.trim().length > 0)
		: [];
	return { ok: true, baseUrl, value: models };
}

export function getFallbackLmStudioModelIds(extraModelId?: string): string[] {
	const candidates = [
		extraModelId,
		process.env.PI_LMSTUDIO_MODEL_ID,
		process.env.PI_LMSTUDIO_GEMMA_MODEL_ID,
		LMSTUDIO_DEFAULT_GEMMA_MODEL_ID,
		process.env.PI_LMSTUDIO_QWEN_MODEL_ID,
		LMSTUDIO_DEFAULT_QWEN_MODEL_ID,
	];
	const seen = new Set<string>();
	const ids: string[] = [];
	for (const candidate of candidates) {
		const id = cleanModelId(candidate);
		if (!id || seen.has(id)) continue;
		seen.add(id);
		ids.push(id);
	}
	return ids;
}

function displayNameForModel(id: string): string {
	return id
		.split(/[/:_-]+/)
		.filter(Boolean)
		.map(part => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ") || id;
}

export function toLmStudioProviderModels(
	models: Array<LmStudioModel | string>,
	options: { baseUrl?: string; contextWindow?: number; maxTokens?: number } = {},
): Model<"openai-completions">[] {
	const baseUrl = normalizeLmStudioBaseUrl(options.baseUrl);
	const seen = new Set<string>();
	const providerModels: Model<"openai-completions">[] = [];

	for (const entry of models) {
		const id = cleanModelId(typeof entry === "string" ? entry : entry.id);
		if (!id || seen.has(id)) continue;
		seen.add(id);
		providerModels.push({
			id,
			name: `${displayNameForModel(id)} (LM Studio local)`,
			api: "openai-completions",
			provider: LMSTUDIO_PROVIDER,
			baseUrl,
			reasoning: false,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: options.contextWindow ?? LMSTUDIO_DEFAULT_CONTEXT_WINDOW,
			maxTokens: options.maxTokens ?? LMSTUDIO_DEFAULT_MAX_TOKENS,
		});
	}

	return providerModels;
}

export async function postLmStudioChatCompletion(
	options: LmStudioChatCompletionOptions,
): Promise<LmStudioResult<LmStudioInferenceResult>> {
	const baseUrl = normalizeLmStudioBaseUrl(options.baseUrl);
	const model = cleanModelId(options.model);
	if (!model) return { ok: false, baseUrl, error: "LM Studio model is required for inference" };
	if (!Array.isArray(options.messages) || options.messages.length === 0) {
		return { ok: false, baseUrl, error: "At least one chat message is required for LM Studio inference" };
	}

	const body: Record<string, unknown> = {
		model,
		messages: options.messages,
		temperature: options.temperature ?? 0.2,
	};
	if (typeof options.maxTokens === "number" && Number.isFinite(options.maxTokens)) {
		body.max_tokens = options.maxTokens;
	}

	const result = await fetchJson<any>(
		`${baseUrl}/chat/completions`,
		baseUrl,
		{ method: "POST", body: JSON.stringify(body) },
		options.timeoutMs ?? LMSTUDIO_DEFAULT_TIMEOUT_MS,
	);
	if (!result.ok) return result;

	const choice = result.value?.choices?.[0];
	const content = choice?.message?.content;
	if (typeof content !== "string" || !content.trim()) {
		return { ok: false, baseUrl, error: "LM Studio returned no assistant text in choices[0].message.content" };
	}

	return {
		ok: true,
		baseUrl,
		value: {
			content,
			model: result.value?.model || model,
			finishReason: choice?.finish_reason ?? null,
			usage: result.value?.usage,
		},
	};
}

export function buildLmStudioMessages(prompt: string, system?: string): LmStudioChatMessage[] {
	const messages: LmStudioChatMessage[] = [];
	if (system?.trim()) messages.push({ role: "system", content: system.trim() });
	messages.push({ role: "user", content: prompt });
	return messages;
}
