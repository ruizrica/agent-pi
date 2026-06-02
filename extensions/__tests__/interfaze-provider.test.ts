import { describe, expect, it, vi } from "vitest";

const registerProvider = vi.fn();

vi.mock("@earendil-works/pi-coding-agent", () => ({
}));

vi.mock("../interfaze.ts", () => ({
	default: (pi: { registerProvider: typeof registerProvider }) => {
		pi.registerProvider("interfaze", {
			baseUrl: "https://api.interfaze.ai/v1",
			apiKey: "$INTERFAZE_API_KEY",
			api: "openai-completions",
			models: [
				{
					id: "interfaze-beta",
					name: "Interfaze Beta",
					reasoning: true,
					input: ["text", "image"],
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
					contextWindow: 1000000,
					maxTokens: 32000,
				},
			],
		});
	},
}));

describe("interfaze provider extension", () => {
	it("registers the Interfaze provider", async () => {
		const { default: extension } = await import("../interfaze.ts");
		extension({ registerProvider } as any);

		expect(registerProvider).toHaveBeenCalledWith(
			"interfaze",
			expect.objectContaining({
				baseUrl: "https://api.interfaze.ai/v1",
				apiKey: "$INTERFAZE_API_KEY",
				api: "openai-completions",
				models: expect.arrayContaining([
					expect.objectContaining({
						id: "interfaze-beta",
						input: ["text", "image"],
						contextWindow: 1000000,
						maxTokens: 32000,
						reasoning: true,
					}),
				]),
			}),
		);
	});
});
