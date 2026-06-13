// ABOUTME: Registers LM Studio as a Pi provider and exposes local model discovery/inference tools.
// ABOUTME: Local implementation workers run through LM Studio's OpenAI-compatible API on port 1234.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
	LMSTUDIO_DEFAULT_BASE_URL,
	LMSTUDIO_DEFAULT_GEMMA_MODEL_ID,
	LMSTUDIO_DEFAULT_QWEN_MODEL_ID,
	LMSTUDIO_DEFAULT_TIMEOUT_MS,
	LMSTUDIO_PROVIDER as LMSTUDIO_PROVIDER_NAME,
	buildLmStudioMessages,
	fetchLmStudioModels,
	getFallbackLmStudioModelIds,
	normalizeLmStudioBaseUrl,
	postLmStudioChatCompletion,
	toLmStudioProviderModels,
	type LmStudioModel,
} from "./lib/lmstudio-client.ts";
import {
	getLmStudioGemmaModelId,
	getLmStudioPreferredModelId,
	getLmStudioQwenModelId,
	setLmStudioGemmaModelId,
	setLmStudioPreferredModelId,
	setLmStudioQwenModelId,
	stripLmStudioCliPrefix,
} from "./lib/lmstudio-spawn.ts";
import { applyExtensionDefaults } from "./lib/themeMap.ts";

export const LMSTUDIO_BASE_URL = LMSTUDIO_DEFAULT_BASE_URL;
export const LMSTUDIO_MODELS_URL = `${LMSTUDIO_BASE_URL}/models`;
export const LMSTUDIO_PROVIDER = LMSTUDIO_PROVIDER_NAME;
export const LMSTUDIO_GEMMA_MODEL_ID = LMSTUDIO_DEFAULT_GEMMA_MODEL_ID;
export const LMSTUDIO_QWEN_MODEL_ID = LMSTUDIO_DEFAULT_QWEN_MODEL_ID;
const HEALTH_TIMEOUT_MS = LMSTUDIO_DEFAULT_TIMEOUT_MS;
const LMSTUDIO_INFO_MESSAGE_TYPE = "lmstudio-info";

type ToolResult = { content: Array<{ type: "text"; text: string }>; details?: unknown };

const ModelsParams = Type.Object({
	base_url: Type.Optional(Type.String({ description: "Optional LM Studio OpenAI-compatible base URL. Defaults to http://127.0.0.1:1234/v1" })),
	timeout_ms: Type.Optional(Type.Number({ description: "Request timeout in milliseconds" })),
});

const InferParams = Type.Object({
	prompt: Type.String({ description: "Prompt to send to the local LM Studio model" }),
	model: Type.Optional(Type.String({ description: "Optional LM Studio model ID, with or without lmstudio/ prefix" })),
	system: Type.Optional(Type.String({ description: "Optional system message" })),
	base_url: Type.Optional(Type.String({ description: "Optional LM Studio OpenAI-compatible base URL" })),
	temperature: Type.Optional(Type.Number({ description: "Sampling temperature. Defaults to 0.2" })),
	max_tokens: Type.Optional(Type.Number({ description: "Optional max_tokens value for chat/completions" })),
	timeout_ms: Type.Optional(Type.Number({ description: "Request timeout in milliseconds" })),
});

function textResult(text: string, details?: unknown): ToolResult {
	return { content: [{ type: "text", text }], details };
}

function formatModels(models: LmStudioModel[]): string {
	if (models.length === 0) return "No models are currently loaded in LM Studio.";
	return models.map(model => `- ${model.id}`).join("\n");
}

function emitMessage(pi: ExtensionAPI, text: string) {
	pi.sendMessage?.({ customType: LMSTUDIO_INFO_MESSAGE_TYPE, content: text, display: true } as any);
}

function rememberAvailableModels(models: LmStudioModel[]) {
	const ids = models.map(model => stripLmStudioCliPrefix(model.id)).filter(Boolean);
	(globalThis as any).__piLmStudioModels = ids;
	const gemma = ids.find(id => /gemma/i.test(id));
	const qwen = ids.find(id => /qwen/i.test(id));
	if (gemma) setLmStudioGemmaModelId(gemma);
	if (qwen) setLmStudioQwenModelId(qwen);
	if (!getLmStudioPreferredModelId() && (gemma || ids[0])) {
		setLmStudioPreferredModelId(gemma || ids[0]);
	}
}

function providerModelsFrom(models: LmStudioModel[], baseUrl?: string) {
	const modelEntries = models.length > 0
		? models
		: getFallbackLmStudioModelIds(getLmStudioPreferredModelId()).map(id => ({ id }));
	return toLmStudioProviderModels(modelEntries, { baseUrl });
}

function registerLmStudioProvider(pi: ExtensionAPI, models: LmStudioModel[] = [], baseUrl?: string) {
	const normalizedBaseUrl = normalizeLmStudioBaseUrl(baseUrl);
	pi.registerProvider(LMSTUDIO_PROVIDER, {
		baseUrl: normalizedBaseUrl,
		apiKey: process.env.LMSTUDIO_API_KEY || "lmstudio",
		api: "openai-completions",
		models: providerModelsFrom(models, normalizedBaseUrl),
	});
}

async function refreshLmStudioProvider(
	pi: ExtensionAPI,
	options: { baseUrl?: string; timeoutMs?: number } = {},
) {
	const result = await fetchLmStudioModels({
		baseUrl: options.baseUrl,
		timeoutMs: options.timeoutMs ?? HEALTH_TIMEOUT_MS,
	});
	if (!result.ok) return result;
	rememberAvailableModels(result.value);
	registerLmStudioProvider(pi, result.value, result.baseUrl);
	return result;
}

async function runInference(args: {
	prompt: string;
	model?: string;
	system?: string;
	base_url?: string;
	temperature?: number;
	max_tokens?: number;
	timeout_ms?: number;
}) {
	const prompt = (args.prompt || "").trim();
	if (!prompt) return { ok: false as const, error: "Prompt is required for LM Studio inference", baseUrl: normalizeLmStudioBaseUrl(args.base_url) };

	let modelId = stripLmStudioCliPrefix(args.model) || getLmStudioPreferredModelId();
	if (!modelId) {
		const models = await fetchLmStudioModels({ baseUrl: args.base_url, timeoutMs: args.timeout_ms ?? HEALTH_TIMEOUT_MS });
		if (!models.ok) return models;
		rememberAvailableModels(models.value);
		modelId = models.value[0]?.id;
		if (!modelId) {
			return { ok: false as const, baseUrl: models.baseUrl, error: "No LM Studio models are loaded. Load a model in LM Studio, enable Local Server, then try again." };
		}
	}

	const result = await postLmStudioChatCompletion({
		baseUrl: args.base_url,
		model: modelId,
		messages: buildLmStudioMessages(prompt, args.system),
		temperature: args.temperature,
		maxTokens: args.max_tokens,
		timeoutMs: args.timeout_ms ?? 120000,
	});
	if (result.ok) setLmStudioPreferredModelId(modelId);
	return result;
}

function notifyHealthError(ctx: ExtensionContext, error: string) {
	ctx.ui.notify(error, "error");
}

function notifyMissingModel(ctx: ExtensionContext, label: string, modelId: string, models: LmStudioModel[]) {
	const available = models.map(m => m.id).join(", ") || "none";
	ctx.ui.notify(`${label} not found in LM Studio. Looking for ${modelId}. Available: ${available}`, "error");
}

export async function checkLmStudioModelHealth(
	ctx: ExtensionContext,
	modelId: string,
	label: string,
): Promise<boolean> {
	const wanted = stripLmStudioCliPrefix(modelId);
	const result = await fetchLmStudioModels({ timeoutMs: HEALTH_TIMEOUT_MS });
	if (!result.ok) {
		notifyHealthError(ctx, result.error);
		return false;
	}
	rememberAvailableModels(result.value);
	const hasModel = result.value.some(model => model.id === wanted);
	if (!hasModel) {
		notifyMissingModel(ctx, label, wanted, result.value);
		return false;
	}
	return true;
}

export async function checkGemmaHealth(ctx: ExtensionContext): Promise<boolean> {
	return checkLmStudioModelHealth(ctx, getLmStudioGemmaModelId(), "Gemma local model");
}

export async function checkQwenHealth(ctx: ExtensionContext): Promise<boolean> {
	return checkLmStudioModelHealth(ctx, getLmStudioQwenModelId(), "Qwen local model");
}

export default function (pi: ExtensionAPI) {
	registerLmStudioProvider(pi);

	pi.registerTool({
		name: "lmstudio_models",
		label: "LM Studio Models",
		description: "List local models currently exposed by the LM Studio OpenAI-compatible server and refresh the Pi lmstudio provider.",
		parameters: ModelsParams,
		async execute(_toolCallId, params) {
			const result = await refreshLmStudioProvider(pi, {
				baseUrl: params.base_url,
				timeoutMs: params.timeout_ms,
			});
			if (!result.ok) return textResult(result.error, result);
			const text = `LM Studio models at ${result.baseUrl}:\n${formatModels(result.value)}`;
			return textResult(text, { baseUrl: result.baseUrl, models: result.value });
		},
	});

	pi.registerTool({
		name: "lmstudio_infer",
		label: "LM Studio Inference",
		description: "Send a prompt to a local LM Studio model through the OpenAI-compatible chat/completions API.",
		parameters: InferParams,
		async execute(_toolCallId, params) {
			const result = await runInference(params);
			if (!result.ok) return textResult(result.error, result);
			return textResult(result.value.content, {
				baseUrl: result.baseUrl,
				model: result.value.model,
				finishReason: result.value.finishReason,
				usage: result.value.usage,
			});
		},
	});

	pi.registerCommand("lmstudio", {
		description: "Use LM Studio local models: /lmstudio status|sync|models|model <id>|infer <prompt>",
		handler: async (args, ctx) => {
			const raw = String(args || "").trim();
			const [subcommandRaw, ...rest] = raw.split(/\s+/).filter(Boolean);
			const subcommand = (subcommandRaw || "status").toLowerCase();
			const remainder = rest.join(" ").trim();

			if (["help", "--help", "-h"].includes(subcommand)) {
				emitMessage(pi, [
					"# LM Studio",
					"",
					"- `/lmstudio status` — check Local Server reachability and loaded models",
					"- `/lmstudio sync` or `/lmstudio models` — refresh the Pi `lmstudio` provider from `/v1/models`",
					"- `/lmstudio model <id>` — set the preferred session model (example: `google/gemma-4-12b-qat`)",
					"- `/lmstudio infer <prompt>` — run a prompt against the preferred/local model",
					"",
					`Default base URL: ${normalizeLmStudioBaseUrl()}`,
				].join("\n"));
				return;
			}

			if (["status", "sync", "models", "list"].includes(subcommand)) {
				const result = await refreshLmStudioProvider(pi);
				if (!result.ok) {
					ctx.ui.setStatus?.("lmstudio", "LM: offline");
					ctx.ui.notify(result.error, "error");
					return;
				}
				ctx.ui.setStatus?.("lmstudio", `LM: ${result.value.length} model${result.value.length === 1 ? "" : "s"}`);
				emitMessage(pi, `LM Studio models at ${result.baseUrl}:\n${formatModels(result.value)}`);
				return;
			}

			if (subcommand === "model") {
				if (!remainder) {
					ctx.ui.notify("Usage: /lmstudio model <model-id>", "warning");
					return;
				}
				const modelId = setLmStudioPreferredModelId(remainder);
				if (/gemma/i.test(modelId)) setLmStudioGemmaModelId(modelId);
				if (/qwen/i.test(modelId)) setLmStudioQwenModelId(modelId);
				registerLmStudioProvider(pi, [], normalizeLmStudioBaseUrl());
				ctx.ui.notify(`LM Studio preferred model set to ${modelId}`, "success");
				return;
			}

			if (subcommand === "infer") {
				if (!remainder) {
					ctx.ui.notify("Usage: /lmstudio infer <prompt>", "warning");
					return;
				}
				const result = await runInference({ prompt: remainder });
				if (!result.ok) {
					ctx.ui.notify(result.error, "error");
					return;
				}
				emitMessage(pi, `# LM Studio (${result.value.model})\n\n${result.value.content}`);
				return;
			}

			ctx.ui.notify("Usage: /lmstudio status|sync|models|model <id>|infer <prompt>|help", "warning");
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
		const result = await refreshLmStudioProvider(pi, { timeoutMs: HEALTH_TIMEOUT_MS });
		if (result.ok && result.value.length > 0) {
			ctx.ui.setStatus?.("lmstudio", `LM: ${result.value.length} model${result.value.length === 1 ? "" : "s"}`);
		}
	});
}
