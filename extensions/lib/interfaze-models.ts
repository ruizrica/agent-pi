// ABOUTME: Model definitions for Interfaze AI provider.
// ABOUTME: Defines the Interfaze-beta model and its capabilities.

import { type Model } from "@earendil-works/pi-ai";

export const INTERFAZE_BETA_MODEL: Model<"openai-completions"> = {
	id: "interfaze-beta",
	name: "Interfaze Beta",
	api: "openai-completions",
	provider: "interfaze",
	baseUrl: "https://api.interfaze.ai/v1",
	reasoning: true,
	input: ["text", "image"],
	cost: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
	},
	contextWindow: 1000000,
	maxTokens: 32000,
	compat: {
		supportsStore: true,
		supportsDeveloperRole: true,
		supportsReasoningEffort: true,
		supportsUsageInStreaming: true,
		maxTokensField: "max_completion_tokens",
		requiresToolResultName: false,
		requiresAssistantAfterToolResult: false,
		requiresThinkingAsText: false,
		requiresReasoningContentOnAssistantMessages: false,
		thinkingFormat: "openai",
		supportsStrictMode: true,
		cacheControlFormat: "anthropic",
		sendSessionAffinityHeaders: true,
		supportsLongCacheRetention: true,
	},
};

export const INTERFAZE_MODELS: readonly Model<"openai-completions">[] = [INTERFAZE_BETA_MODEL];