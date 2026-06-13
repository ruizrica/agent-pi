import { afterEach, describe, expect, it, vi } from "vitest";
import {
	LMSTUDIO_DEFAULT_BASE_URL,
	LMSTUDIO_DEFAULT_GEMMA_MODEL_ID,
	buildLmStudioMessages,
	fetchLmStudioModels,
	getFallbackLmStudioModelIds,
	normalizeLmStudioBaseUrl,
	postLmStudioChatCompletion,
	toLmStudioProviderModels,
} from "../lib/lmstudio-client.ts";

function jsonResponse(body: unknown, ok = true, status = 200): any {
	return {
		ok,
		status,
		statusText: ok ? "OK" : "Error",
		json: vi.fn(async () => body),
		text: vi.fn(async () => JSON.stringify(body)),
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
	delete process.env.LMSTUDIO_BASE_URL;
	delete process.env.PI_LMSTUDIO_MODEL_ID;
	delete process.env.PI_LMSTUDIO_GEMMA_MODEL_ID;
	delete process.env.PI_LMSTUDIO_QWEN_MODEL_ID;
});

describe("lmstudio-client", () => {
	it("normalizes LM Studio base URLs to the OpenAI-compatible /v1 base", () => {
		expect(normalizeLmStudioBaseUrl()).toBe(LMSTUDIO_DEFAULT_BASE_URL);
		expect(normalizeLmStudioBaseUrl("http://127.0.0.1:1234")).toBe("http://127.0.0.1:1234/v1");
		expect(normalizeLmStudioBaseUrl("http://127.0.0.1:1234/v1/")).toBe("http://127.0.0.1:1234/v1");
		expect(normalizeLmStudioBaseUrl("http://127.0.0.1:1234/api/v1")).toBe("http://127.0.0.1:1234/v1");
	});

	it("fetches and parses loaded models", async () => {
		const fetchMock = vi.fn(async () => jsonResponse({
			data: [
				{ id: "google/gemma-4-12b-qat" },
				{ id: "qwen/qwen3.6-27b" },
			],
		}));
		vi.stubGlobal("fetch", fetchMock);

		const result = await fetchLmStudioModels({ baseUrl: "http://localhost:1234", timeoutMs: 1000 });

		expect(fetchMock).toHaveBeenCalledWith(
			"http://localhost:1234/v1/models",
			expect.objectContaining({ method: "GET" }),
		);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.map(model => model.id)).toEqual(["google/gemma-4-12b-qat", "qwen/qwen3.6-27b"]);
		}
	});

	it("returns a helpful server-off error when LM Studio is unreachable", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("connect ECONNREFUSED"); }));

		const result = await fetchLmStudioModels({ timeoutMs: 1000 });

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("LM Studio server not reachable");
			expect(result.error).toContain("Toggle LM Studio Local Server on");
		}
	});

	it("maps model IDs to zero-cost LM Studio provider models", () => {
		const models = toLmStudioProviderModels(["google/gemma-4-12b-qat", "lmstudio/qwen/qwen3.6-27b"]);

		expect(models).toHaveLength(2);
		expect(models[0]).toMatchObject({
			id: "google/gemma-4-12b-qat",
			provider: "lmstudio",
			api: "openai-completions",
			baseUrl: LMSTUDIO_DEFAULT_BASE_URL,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		});
	});

	it("includes the screenshot Gemma model in fallback provider IDs", () => {
		expect(getFallbackLmStudioModelIds()).toContain(LMSTUDIO_DEFAULT_GEMMA_MODEL_ID);
	});

	it("posts chat completions and extracts assistant text", async () => {
		const fetchMock = vi.fn(async () => jsonResponse({
			model: "google/gemma-4-12b-qat",
			choices: [{ message: { content: "hello from local" }, finish_reason: "stop" }],
			usage: { prompt_tokens: 4, completion_tokens: 3 },
		}));
		vi.stubGlobal("fetch", fetchMock);

		const result = await postLmStudioChatCompletion({
			model: "lmstudio/google/gemma-4-12b-qat",
			messages: buildLmStudioMessages("hello", "be concise"),
			temperature: 0.1,
			maxTokens: 32,
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.content).toBe("hello from local");
			expect(result.value.model).toBe("google/gemma-4-12b-qat");
		}
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.model).toBe("google/gemma-4-12b-qat");
		expect(body.messages).toEqual([
			{ role: "system", content: "be concise" },
			{ role: "user", content: "hello" },
		]);
		expect(body.max_tokens).toBe(32);
	});
});
