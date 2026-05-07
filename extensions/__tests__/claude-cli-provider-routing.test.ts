// ABOUTME: Tests top-level Claude provider guard helpers for CLI-only routing.

import { describe, it, expect } from "vitest";
import {
	DIRECT_CLAUDE_BLOCKED_MESSAGE,
	buildClaudeProviderPrompt,
	isDirectClaudeModel,
} from "../lib/claude-provider-stream.ts";

describe("Claude CLI provider routing guard", () => {
	it("identifies Anthropic Claude-family models as direct-Claude guarded models", () => {
		expect(isDirectClaudeModel({ provider: "anthropic", id: "claude-opus-4-6" } as any)).toBe(true);
		expect(isDirectClaudeModel({ provider: "anthropic", id: "claude-sonnet-4-20250514" } as any)).toBe(true);
	});

	it("does not guard non-Anthropic or non-Claude models", () => {
		expect(isDirectClaudeModel({ provider: "openrouter", id: "anthropic/claude-opus-4-6" } as any)).toBe(false);
		expect(isDirectClaudeModel({ provider: "anthropic", id: "not-claude" } as any)).toBe(false);
		expect(isDirectClaudeModel({ provider: "ollama", id: "claude-like-local" } as any)).toBe(false);
	});

	it("keeps a clear fail-closed direct SDK/API message", () => {
		expect(DIRECT_CLAUDE_BLOCKED_MESSAGE).toContain("Direct Anthropic SDK/API routing is disabled");
		expect(DIRECT_CLAUDE_BLOCKED_MESSAGE).toContain("Claude CLI");
	});

	it("serializes main-turn context for Claude CLI prompt packets", () => {
		const prompt = buildClaudeProviderPrompt({
			systemPrompt: "System rules",
			messages: [
				{ role: "user", content: "Hello", timestamp: 1 },
				{
					role: "assistant",
					content: [{ type: "text", text: "Hi" }],
					api: "anthropic-messages",
					provider: "anthropic",
					model: "claude-opus-4-6",
					usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
					stopReason: "stop",
					timestamp: 2,
				},
			],
		});

		expect(prompt).toContain("## System Prompt");
		expect(prompt).toContain("System rules");
		expect(prompt).toContain("User:\nHello");
		expect(prompt).toContain("Assistant:\nHi");
	});

	it("redirects Pi viewer tools to the agent-viewer CLI for the Claude CLI provider", () => {
		const prompt = buildClaudeProviderPrompt({
			systemPrompt: "Use show_plan / show_spec / show_report when ready.",
			messages: [
				{ role: "user", content: "Draft a plan", timestamp: 1 },
			],
		});

		// Header announcing the CLI substitution
		expect(prompt).toContain("## Viewer Substitutions (agent-viewer CLI)");
		// Each Pi viewer tool is mapped to the right agent-viewer subcommand
		expect(prompt).toContain("show_plan");
		expect(prompt).toContain("agent-viewer plan");
		expect(prompt).toContain("show_spec");
		expect(prompt).toContain("agent-viewer spec");
		expect(prompt).toContain("show_report");
		expect(prompt).toContain("agent-viewer completion");
		expect(prompt).toContain("show_reports");
		expect(prompt).toContain("agent-viewer reports");
		// Tells Claude to invoke via Bash with --json so it can read the result
		expect(prompt).toContain("Bash");
		expect(prompt).toContain("--json");
	});
});
