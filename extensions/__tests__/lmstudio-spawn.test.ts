import { afterEach, describe, expect, it } from "vitest";
import {
	appendLmStudioExtensionArgs,
	applyLmStudioSpawnEnv,
	getLmStudioGemmaModelId,
	getLmStudioQwenModelId,
	isLmStudioCliModel,
	setLmStudioPreferredModelId,
	stripLmStudioCliPrefix,
	toLmStudioCliModel,
} from "../lib/lmstudio-spawn.ts";

afterEach(() => {
	delete process.env.PI_LMSTUDIO_MODEL_ID;
	delete process.env.PI_LMSTUDIO_GEMMA_MODEL_ID;
	delete process.env.PI_LMSTUDIO_QWEN_MODEL_ID;
	delete process.env.PI_GEMMA_OVERLAY_ACTIVE;
	delete process.env.PI_QWEN_OVERLAY_ACTIVE;
	delete (globalThis as any).__piLmStudioPreferredModelId;
	delete (globalThis as any).__piLmStudioGemmaModelId;
	delete (globalThis as any).__piLmStudioQwenModelId;
	delete (globalThis as any).__piGemmaOverlay;
	delete (globalThis as any).__piQwenOverlay;
});

describe("lmstudio spawn helpers", () => {
	it("converts local model IDs to Pi CLI model strings", () => {
		expect(toLmStudioCliModel("google/gemma-4-12b-qat")).toBe("lmstudio/google/gemma-4-12b-qat");
		expect(toLmStudioCliModel("lmstudio/google/gemma-4-12b-qat")).toBe("lmstudio/google/gemma-4-12b-qat");
		expect(isLmStudioCliModel("lmstudio/google/gemma-4-12b-qat")).toBe(true);
		expect(isLmStudioCliModel("openrouter/openai/gpt-4o")).toBe(false);
		expect(stripLmStudioCliPrefix("lmstudio/google/gemma-4-12b-qat")).toBe("google/gemma-4-12b-qat");
	});

	it("defaults Gemma routing to the screenshot model and allows env overrides", () => {
		expect(getLmStudioGemmaModelId()).toBe("google/gemma-4-12b-qat");
		process.env.PI_LMSTUDIO_GEMMA_MODEL_ID = "google/custom-gemma";
		expect(getLmStudioGemmaModelId()).toBe("google/custom-gemma");
	});

	it("keeps Qwen routing configurable", () => {
		expect(getLmStudioQwenModelId()).toBe("qwen/qwen3.6-27b");
		process.env.PI_LMSTUDIO_QWEN_MODEL_ID = "qwen/custom";
		expect(getLmStudioQwenModelId()).toBe("qwen/custom");
	});

	it("uses session preferred model as a fallback for local overlays", () => {
		setLmStudioPreferredModelId("google/gemma-4-12b-qat");
		expect(process.env.PI_LMSTUDIO_MODEL_ID).toBe("google/gemma-4-12b-qat");
		expect(getLmStudioGemmaModelId()).toBe("google/gemma-4-12b-qat");
	});

	it("appends lmstudio-overlay.ts to child args for lmstudio models", () => {
		const args = ["--mode", "json"];
		const updated = appendLmStudioExtensionArgs(args, "/repo/extensions", "lmstudio/google/gemma-4-12b-qat");
		expect(updated).toEqual(["--mode", "json", "-e", "/repo/extensions/lmstudio-overlay.ts"]);
		expect(appendLmStudioExtensionArgs(updated, "/repo/extensions", "lmstudio/google/gemma-4-12b-qat"))
			.toEqual(updated);
	});

	it("appends lmstudio-overlay.ts when a local overlay env flag is active", () => {
		process.env.PI_GEMMA_OVERLAY_ACTIVE = "1";
		expect(appendLmStudioExtensionArgs([], "/repo/extensions", "openai/gpt-4o"))
			.toEqual(["-e", "/repo/extensions/lmstudio-overlay.ts"]);
	});

	it("propagates stripped local model IDs through child env", () => {
		const env: Record<string, string | undefined> = {};
		applyLmStudioSpawnEnv(env, "lmstudio/google/gemma-4-12b-qat");
		expect(env.PI_LMSTUDIO_MODEL_ID).toBe("google/gemma-4-12b-qat");
	});
});
