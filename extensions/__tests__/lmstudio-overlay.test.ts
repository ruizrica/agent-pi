import { afterEach, describe, expect, it, vi } from "vitest";
import lmstudioExtension from "../lmstudio-overlay.ts";

function jsonResponse(body: unknown, ok = true, status = 200): any {
	return {
		ok,
		status,
		statusText: ok ? "OK" : "Error",
		json: vi.fn(async () => body),
		text: vi.fn(async () => JSON.stringify(body)),
	};
}

function makeHarness() {
	const tools: Record<string, any> = {};
	const commands: Record<string, any> = {};
	const handlers: Record<string, any[]> = {};
	const messages: any[] = [];
	const pi = {
		registerProvider: vi.fn(),
		registerTool: vi.fn((tool: any) => { tools[tool.name] = tool; }),
		registerCommand: vi.fn((name: string, command: any) => { commands[name] = command; }),
		on: vi.fn((event: string, handler: any) => { handlers[event] = [...(handlers[event] || []), handler]; }),
		sendMessage: vi.fn((message: any) => { messages.push(message); }),
	};
	const ctx = {
		ui: {
			notify: vi.fn(),
			setStatus: vi.fn(),
		},
	};
	lmstudioExtension(pi as any);
	return { pi, tools, commands, handlers, messages, ctx };
}

afterEach(() => {
	vi.unstubAllGlobals();
	delete process.env.LMSTUDIO_BASE_URL;
	delete process.env.PI_LMSTUDIO_MODEL_ID;
	delete process.env.PI_LMSTUDIO_GEMMA_MODEL_ID;
	delete process.env.PI_LMSTUDIO_QWEN_MODEL_ID;
	delete (globalThis as any).__piLmStudioPreferredModelId;
	delete (globalThis as any).__piLmStudioModels;
	delete (globalThis as any).__piLmStudioGemmaModelId;
	delete (globalThis as any).__piLmStudioQwenModelId;
});

describe("lmstudio overlay extension", () => {
	it("registers the LM Studio provider with fallback local models", () => {
		const { pi } = makeHarness();

		expect(pi.registerProvider).toHaveBeenCalledWith("lmstudio", expect.objectContaining({
			baseUrl: "http://127.0.0.1:1234/v1",
			apiKey: "lmstudio",
			api: "openai-completions",
			models: expect.arrayContaining([
				expect.objectContaining({ id: "google/gemma-4-12b-qat", input: ["text"], contextWindow: 128000 }),
			]),
		}));
	});

	it("lists loaded models and refreshes provider registration", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ data: [{ id: "google/gemma-4-12b-qat" }] })));
		const { pi, tools } = makeHarness();

		const result = await tools.lmstudio_models.execute("tool-1", {}, undefined, undefined, {});

		expect(result.content[0].text).toContain("google/gemma-4-12b-qat");
		expect(pi.registerProvider).toHaveBeenLastCalledWith("lmstudio", expect.objectContaining({
			models: [expect.objectContaining({ id: "google/gemma-4-12b-qat" })],
		}));
	});

	it("reports a helpful model list error when LM Studio is offline", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
		const { tools } = makeHarness();

		const result = await tools.lmstudio_models.execute("tool-1", {}, undefined, undefined, {});

		expect(result.content[0].text).toContain("LM Studio server not reachable");
		expect(result.content[0].text).toContain("Toggle LM Studio Local Server on");
	});

	it("runs direct local inference through chat/completions", async () => {
		const fetchMock = vi.fn(async (url: string) => {
			if (url.endsWith("/models")) return jsonResponse({ data: [{ id: "google/gemma-4-12b-qat" }] });
			return jsonResponse({ choices: [{ message: { content: "local answer" }, finish_reason: "stop" }], model: "google/gemma-4-12b-qat" });
		});
		vi.stubGlobal("fetch", fetchMock);
		const { tools } = makeHarness();

		const result = await tools.lmstudio_infer.execute("tool-1", { prompt: "hello" }, undefined, undefined, {});

		expect(result.content[0].text).toBe("local answer");
		expect(fetchMock).toHaveBeenCalledWith(
			"http://127.0.0.1:1234/v1/chat/completions",
			expect.objectContaining({ method: "POST" }),
		);
	});

	it("registers the canonical /lmstudio command family", () => {
		const { commands } = makeHarness();
		expect(commands.lmstudio).toBeDefined();
		expect(commands.lmstudio.description).toContain("status|sync|models|model <id>|infer <prompt>");
	});

	it("handles /lmstudio model and /lmstudio infer", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ choices: [{ message: { content: "from preferred" } }], model: "google/gemma-4-12b-qat" })));
		const { commands, ctx, messages } = makeHarness();

		await commands.lmstudio.handler("model google/gemma-4-12b-qat", ctx);
		expect(process.env.PI_LMSTUDIO_MODEL_ID).toBe("google/gemma-4-12b-qat");
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("preferred model set"), "success");

		await commands.lmstudio.handler("infer hello", ctx);
		expect(messages.at(-1).content).toContain("from preferred");
	});

	it("session_start refreshes provider when the server is reachable", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ data: [{ id: "google/gemma-4-12b-qat" }] })));
		const { pi, handlers, ctx } = makeHarness();

		await handlers.session_start[0]({}, ctx);

		expect(pi.registerProvider).toHaveBeenLastCalledWith("lmstudio", expect.objectContaining({
			models: [expect.objectContaining({ id: "google/gemma-4-12b-qat" })],
		}));
		expect(ctx.ui.setStatus).toHaveBeenCalledWith("lmstudio", "LM: 1 model");
	});
});
