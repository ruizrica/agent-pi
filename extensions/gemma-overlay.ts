// ABOUTME: Compatibility exports for the /gemma overlay now backed by LM Studio.
// ABOUTME: Keeps legacy imports stable while the local provider is shared across Gemma and Qwen.

export { default, checkGemmaHealth as checkOllamaHealth } from "./lmstudio-overlay.ts";
export { checkGemmaHealth, checkLmStudioModelHealth, checkQwenHealth, LMSTUDIO_BASE_URL, LMSTUDIO_GEMMA_MODEL_ID, LMSTUDIO_PROVIDER, LMSTUDIO_QWEN_MODEL_ID } from "./lmstudio-overlay.ts";
