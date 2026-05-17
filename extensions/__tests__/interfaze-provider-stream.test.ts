import { describe, expect, it, vi } from "vitest";

const streamSimpleOpenAICompletions = vi.fn();

vi.mock("@earendil-works/pi-ai", () => ({
	streamSimpleOpenAICompletions,
}));

describe("streamInterfazeProvider", () => {
	it("rewrites the provider metadata before streaming", async () => {
		streamSimpleOpenAICompletions.mockReturnValue("stream-result");
		const { streamInterfazeProvider } = await import("../lib/interfaze-provider.ts");
		const model = {
			id: "custom-model",
			name: "Custom Model",
			api: "anthropic-messages",
			provider: "other-provider",
			baseUrl: "https://example.com/v1",
		};
		const context = {} as any;
		const options = {} as any;

		const result = streamInterfazeProvider(model as any, context, options);

		expect(streamSimpleOpenAICompletions).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "custom-model",
				api: "openai-completions",
				provider: "interfaze",
				baseUrl: "https://api.interfaze.ai/v1",
			}),
			context,
			options,
		);
		expect(result).toBe("stream-result");
	});
});
