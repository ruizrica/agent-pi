// ABOUTME: OpenAI-compatible provider for Interfaze AI models.

import {
	streamSimpleOpenAICompletions,
	type AssistantMessageEventStream,
	type Context,
	type Model,
	type SimpleStreamOptions,
} from "@earendil-works/pi-ai";

export function streamInterfazeProvider(
	model: Model<"openai-completions">,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream {
	const interfazeModel = {
		...model,
		api: "openai-completions" as const,
		baseUrl: "https://api.interfaze.ai/v1",
		provider: "interfaze" as const,
	};

	return streamSimpleOpenAICompletions(interfazeModel, context, options);
}