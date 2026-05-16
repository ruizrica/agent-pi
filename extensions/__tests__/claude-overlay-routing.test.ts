import { describe, it, expect } from "vitest";
import {
	getClaudeExecutionMode,
	isClaudeFamilyModel,
	resolveClaudeProfileForAgent,
	shouldUseClaudeCliForAgent,
} from "../lib/toolkit-cli.ts";

describe("claude overlay routing", () => {
	it("detects Claude-family models", () => {
		expect(isClaudeFamilyModel("anthropic/claude-opus-4-6")).toBe(true);
		expect(isClaudeFamilyModel("anthropic/claude-haiku-4-5")).toBe(true);
		expect(isClaudeFamilyModel("openai/gpt-5.4")).toBe(false);
	});

	it("locks Claude execution to direct API mode", () => {
		expect(getClaudeExecutionMode({})).toBe("direct-api");
		expect(getClaudeExecutionMode({ PI_CLAUDE_MODE: "code-cli" } as any)).toBe("direct-api");
		expect(shouldUseClaudeCliForAgent("claude-worker", "anthropic/claude-haiku-4-5", false)).toBe(false);
		expect(shouldUseClaudeCliForAgent("claude-advisor", "anthropic/claude-opus-4-6", false)).toBe(false);
	});

	it("keeps generic Claude-family agents on direct API routing", () => {
		expect(shouldUseClaudeCliForAgent("reviewer", "anthropic/claude-opus-4-6", true)).toBe(false);
		expect(shouldUseClaudeCliForAgent("reviewer", "anthropic/claude-opus-4-6", false)).toBe(false);
		expect(shouldUseClaudeCliForAgent("builder", "anthropic/claude-haiku-4-5", false)).toBe(false);
		expect(shouldUseClaudeCliForAgent("builder", "openai/gpt-5.4", true)).toBe(false);
	});

	it("maps Opus-class generic roles to advisor profile", () => {
		expect(resolveClaudeProfileForAgent("reviewer", "anthropic/claude-opus-4-6")).toBe("claude-advisor");
		expect(resolveClaudeProfileForAgent("builder", "anthropic/claude-haiku-4-5")).toBe("claude-worker");
	});
});
