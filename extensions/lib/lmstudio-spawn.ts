// ABOUTME: Helpers for routing spawned Pi workers through the local LM Studio provider.
// ABOUTME: Keeps model IDs, CLI model strings, child extension args, and env propagation consistent.

import { join } from "node:path";
import {
	LMSTUDIO_DEFAULT_GEMMA_MODEL_ID,
	LMSTUDIO_DEFAULT_QWEN_MODEL_ID,
	LMSTUDIO_PROVIDER,
} from "./lmstudio-client.ts";

const g = globalThis as any;

function cleanModelId(modelId: string | undefined | null): string {
	const trimmed = (modelId || "").trim();
	return trimmed.startsWith(`${LMSTUDIO_PROVIDER}/`)
		? trimmed.slice(`${LMSTUDIO_PROVIDER}/`.length)
		: trimmed;
}

function firstConfigured(...values: Array<string | undefined | null>): string | undefined {
	for (const value of values) {
		const cleaned = cleanModelId(value);
		if (cleaned) return cleaned;
	}
	return undefined;
}

export function isLmStudioCliModel(model: string | undefined | null): boolean {
	return (model || "").trim().startsWith(`${LMSTUDIO_PROVIDER}/`);
}

export function stripLmStudioCliPrefix(model: string | undefined | null): string {
	return cleanModelId(model);
}

export function toLmStudioCliModel(modelId: string): string {
	const cleaned = cleanModelId(modelId);
	return cleaned ? `${LMSTUDIO_PROVIDER}/${cleaned}` : `${LMSTUDIO_PROVIDER}/${LMSTUDIO_DEFAULT_GEMMA_MODEL_ID}`;
}

export function getLmStudioPreferredModelId(): string | undefined {
	return firstConfigured(
		g.__piLmStudioPreferredModelId,
		process.env.PI_LMSTUDIO_MODEL_ID,
	);
}

export function setLmStudioPreferredModelId(modelId: string): string {
	const cleaned = cleanModelId(modelId);
	if (!cleaned) return "";
	g.__piLmStudioPreferredModelId = cleaned;
	process.env.PI_LMSTUDIO_MODEL_ID = cleaned;
	return cleaned;
}

export function getLmStudioGemmaModelId(): string {
	return firstConfigured(
		process.env.PI_LMSTUDIO_GEMMA_MODEL_ID,
		g.__piLmStudioGemmaModelId,
		getLmStudioPreferredModelId(),
	) || LMSTUDIO_DEFAULT_GEMMA_MODEL_ID;
}

export function setLmStudioGemmaModelId(modelId: string): string {
	const cleaned = cleanModelId(modelId);
	if (!cleaned) return "";
	g.__piLmStudioGemmaModelId = cleaned;
	process.env.PI_LMSTUDIO_GEMMA_MODEL_ID = cleaned;
	return cleaned;
}

export function getLmStudioQwenModelId(): string {
	return firstConfigured(
		process.env.PI_LMSTUDIO_QWEN_MODEL_ID,
		g.__piLmStudioQwenModelId,
		getLmStudioPreferredModelId(),
	) || LMSTUDIO_DEFAULT_QWEN_MODEL_ID;
}

export function setLmStudioQwenModelId(modelId: string): string {
	const cleaned = cleanModelId(modelId);
	if (!cleaned) return "";
	g.__piLmStudioQwenModelId = cleaned;
	process.env.PI_LMSTUDIO_QWEN_MODEL_ID = cleaned;
	return cleaned;
}

export function shouldLoadLmStudioExtension(model: string | undefined | null): boolean {
	return isLmStudioCliModel(model)
		|| !!g.__piGemmaOverlay
		|| !!g.__piQwenOverlay
		|| process.env.PI_GEMMA_OVERLAY_ACTIVE === "1"
		|| process.env.PI_QWEN_OVERLAY_ACTIVE === "1";
}

export function appendLmStudioExtensionArgs(args: string[], extDir: string, model: string | undefined | null): string[] {
	if (!shouldLoadLmStudioExtension(model)) return args;
	const lmstudioExtPath = join(extDir, "lmstudio-overlay.ts");
	for (let i = 0; i < args.length - 1; i++) {
		if (args[i] === "-e" && args[i + 1] === lmstudioExtPath) return args;
	}
	args.push("-e", lmstudioExtPath);
	return args;
}

export function applyLmStudioSpawnEnv(env: Record<string, string | undefined>, model: string | undefined | null): Record<string, string | undefined> {
	const modelId = stripLmStudioCliPrefix(model);
	if (modelId) env.PI_LMSTUDIO_MODEL_ID = modelId;
	return env;
}
