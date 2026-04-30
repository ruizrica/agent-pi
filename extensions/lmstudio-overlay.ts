// ABOUTME: Registers LM Studio as a Pi provider and exposes health checks for local Gemma and Qwen overlays.
// ABOUTME: Local implementation workers run through LM Studio's OpenAI-compatible API on port 1234.

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { applyExtensionDefaults } from "./lib/themeMap.ts";

export const LMSTUDIO_BASE_URL = "http://127.0.0.1:1234/v1";
export const LMSTUDIO_MODELS_URL = `${LMSTUDIO_BASE_URL}/models`;
export const LMSTUDIO_PROVIDER = "lmstudio";
export const LMSTUDIO_GEMMA_MODEL_ID = "google/gemma-4-26b-a4b";
export const LMSTUDIO_QWEN_MODEL_ID = "qwen/qwen3.6-27b";
const HEALTH_TIMEOUT_MS = 3000;

type LmStudioModel = { id: string };
type ModelsResponse = { data?: LmStudioModel[] };

async function fetchLmStudioModels(): Promise<LmStudioModel[]> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
	try {
		const res = await fetch(LMSTUDIO_MODELS_URL, { signal: controller.signal });
		if (!res.ok) {
			throw new Error(`HTTP ${res.status}`);
		}
		const data = await res.json() as ModelsResponse;
		return data.data || [];
	} finally {
		clearTimeout(timeout);
	}
}

function notifyMissingModel(ctx: ExtensionContext, label: string, modelId: string, models: LmStudioModel[]) {
	const available = models.map(m => m.id).join(", ") || "none";
	ctx.ui.notify(`${label} not found in LM Studio. Available: ${available}`, "error");
}

export async function checkLmStudioModelHealth(
	ctx: ExtensionContext,
	modelId: string,
	label: string,
): Promise<boolean> {
	try {
		const models = await fetchLmStudioModels();
		const hasModel = models.some(model => model.id === modelId);
		if (!hasModel) {
			notifyMissingModel(ctx, label, modelId, models);
			return false;
		}
		return true;
	} catch (err: any) {
		const msg = err?.name === "AbortError"
			? "LM Studio health check timed out (is the local server running?)"
			: `LM Studio not reachable: ${err?.message || "unknown error"}`;
		ctx.ui.notify(msg, "error");
		return false;
	}
}

export async function checkGemmaHealth(ctx: ExtensionContext): Promise<boolean> {
	return checkLmStudioModelHealth(ctx, LMSTUDIO_GEMMA_MODEL_ID, "Gemma 4");
}

export async function checkQwenHealth(ctx: ExtensionContext): Promise<boolean> {
	return checkLmStudioModelHealth(ctx, LMSTUDIO_QWEN_MODEL_ID, "Qwen 3.6");
}

export default function (pi: ExtensionAPI) {
	pi.registerProvider(LMSTUDIO_PROVIDER, {
		baseUrl: LMSTUDIO_BASE_URL,
		apiKey: "lmstudio",
		api: "openai-completions",
		models: [
			{
				id: LMSTUDIO_GEMMA_MODEL_ID,
				name: "Gemma 4 26B A4B (LM Studio local)",
				reasoning: false,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 128000,
				maxTokens: 8192,
			},
			{
				id: LMSTUDIO_QWEN_MODEL_ID,
				name: "Qwen 3.6 27B (LM Studio local)",
				reasoning: false,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 128000,
				maxTokens: 8192,
			},
		],
	});

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
	});
}
