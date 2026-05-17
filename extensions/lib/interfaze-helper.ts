// ABOUTME: Helper for easy Interfaze API access in the pi-ai framework.
// ABOUTME: Provides direct access to Interfaze models using standard OpenAI patterns.

import { streamSimpleOpenAICompletions, type AssistantMessageEventStream, type Context, type Model, type SimpleStreamOptions } from "@earendil-works/pi-ai";
import { INTERFAZE_BETA_MODEL } from "./interfaze-models.ts";

/**
 * Create an Interfaze model with the correct API configuration
 * This allows for easy usage of the interfaze-beta model via standard OpenAI patterns
 */
export function createInterfazeModel(modelId: string = INTERFAZE_BETA_MODEL.id): Model<"openai-completions"> {
	return {
		...INTERFAZE_BETA_MODEL,
		id: modelId,
		name: modelId === INTERFAZE_BETA_MODEL.id ? INTERFAZE_BETA_MODEL.name : `Interfaze ${modelId}`,
	};
}

/**
 * Stream handler that makes it simple to use Interfaze models
 * with the Pi AI framework.
 */
export function streamInterfazeModel(
	model: Model<"openai-completions">,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream {
	return streamSimpleOpenAICompletions(model, context, options);
}

/**
 * Convenience function to create and stream directly with minimal setup
 */
export function streamInterfaze(
	modelId: string,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream {
	return streamInterfazeModel(createInterfazeModel(modelId), context, options);
}