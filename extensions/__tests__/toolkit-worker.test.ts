// ABOUTME: Tests toolkit CLI worker helpers and routing behavior.

import { describe, it, expect } from "vitest";
import {
	isToolkitCliAgent,
	normalizeToolkitAgentName,
	hideToolkitWidgetMetadata,
	resolveToolkitWorkerModel,
	TOOLKIT_WORKER_MODEL,
	getToolkitWorkerArgs,
} from "../lib/toolkit-cli.ts";
import { resolveAgentModelString, type AgentModelsConfig } from "../lib/agent-defs.ts";

describe("toolkit CLI agent detection", () => {
	it("detects toolkit workers and legacy aliases", () => {
		expect(isToolkitCliAgent("codex-worker")).toBe(true);
		expect(isToolkitCliAgent("codex-agent")).toBe(true);
		expect(isToolkitCliAgent("CURSOR-WORKER")).toBe(true);
		expect(isToolkitCliAgent("opencode-worker")).toBe(true);
		expect(isToolkitCliAgent("builder")).toBe(false);
	});

	it("normalizes legacy toolkit aliases to worker names", () => {
		expect(normalizeToolkitAgentName("cursor-agent")).toBe("cursor-worker");
		expect(normalizeToolkitAgentName("codex-agent")).toBe("codex-worker");
		expect(normalizeToolkitAgentName("droid-agent")).toBe("droid-worker");
		expect(normalizeToolkitAgentName("gemini-agent")).toBe("gemini-worker");
		expect(normalizeToolkitAgentName("opencode-agent")).toBe("opencode-worker");
		expect(normalizeToolkitAgentName("qwen-agent")).toBe("qwen-agent");
	});

	it("hides widget metadata only for external toolkit workers", () => {
		expect(hideToolkitWidgetMetadata("cursor-worker")).toBe(true);
		expect(hideToolkitWidgetMetadata("codex-agent")).toBe(true);
		expect(hideToolkitWidgetMetadata("claude-worker")).toBe(false);
		expect(hideToolkitWidgetMetadata("scout")).toBe(false);
	});
});

describe("toolkit worker model resolution", () => {
	it("forces toolkit agents onto the shared worker model", () => {
		expect(resolveToolkitWorkerModel("codex-worker", "openai/gpt-4o")).toBe(TOOLKIT_WORKER_MODEL);
		expect(resolveToolkitWorkerModel("codex-agent", "openai/gpt-4o")).toBe(TOOLKIT_WORKER_MODEL);
	});

	it("preserves configured Claude profile models", () => {
		expect(resolveToolkitWorkerModel("claude-worker", "anthropic/claude-haiku-4-5")).toBe("anthropic/claude-haiku-4-5");
		expect(resolveToolkitWorkerModel("claude-advisor", "anthropic/claude-opus-4-6")).toBe("anthropic/claude-opus-4-6");
	});

	it("preserves non-toolkit fallback models", () => {
		expect(resolveToolkitWorkerModel("reviewer", "anthropic/claude-opus-4-6")).toBe("anthropic/claude-opus-4-6");
	});
});

describe("toolkit worker args", () => {
	it("builds pi args with the shared worker model", () => {
		const args = getToolkitWorkerArgs({
			name: "codex-worker",
			tools: "bash,read",
			systemPrompt: "Use Codex CLI",
		}, {
			task: "Analyze this project",
			sessionFile: "/tmp/session.jsonl",
		});

		expect(args).toContain("--model");
		expect(args).toContain(TOOLKIT_WORKER_MODEL);
		expect(args).toContain("--tools");
		expect(args).toContain("bash,read");
		expect(args).toContain("Analyze this project");
	});
});

describe("agent model config split", () => {
	const config: AgentModelsConfig = {
		default: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
		agents: {
			reviewer: { provider: "anthropic", model: "claude-opus-4-6" },
			"codex-worker": { provider: "openai-codex", model: "gpt-5.4" },
			"claude-worker": { provider: "anthropic", model: "claude-haiku-4-5" },
		},
	};

	it("still resolves normal agents from standard config", () => {
		expect(resolveAgentModelString("reviewer", config)).toBe("anthropic/claude-opus-4-6");
	});

	it("overrides toolkit agents to the shared worker model even if config differs", () => {
		expect(resolveAgentModelString("codex-worker", config)).toBe(TOOLKIT_WORKER_MODEL);
		expect(resolveAgentModelString("codex-agent", config)).toBe(TOOLKIT_WORKER_MODEL);
	});

	it("preserves Claude profile models from config", () => {
		expect(resolveAgentModelString("claude-worker", config)).toBe("anthropic/claude-haiku-4-5");
	});
});
