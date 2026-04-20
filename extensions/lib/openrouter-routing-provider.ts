// ABOUTME: Provider stream routing helpers for the OpenRouter routing extension.
// ABOUTME: Rewrites variant model payloads back to base models while pinning provider and quantization.

import {
	streamSimpleOpenAICompletions,
	type Api,
	type AssistantMessageEventStream,
	type Context,
	type Model,
	type SimpleStreamOptions,
} from "@mariozechner/pi-ai";
import { OPENROUTER_ENRICHED_MODEL_PREFIX, type OpenRouterRouteVariant } from "./openrouter-routing-types.ts";

export function createStreamFactory(routes: ReadonlyMap<string, OpenRouterRouteVariant>) {
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
