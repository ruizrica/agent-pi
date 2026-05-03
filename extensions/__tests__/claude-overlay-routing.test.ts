import { describe, it, expect } from "vitest";
import {
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

	it("preserves native Claude profiles regardless of overlay", () => {
		expect(shouldUseClaudeCliForAgent("claude-worker", "anthropic/claude-haiku-4-5", false)).toBe(true);
		expect(shouldUseClaudeCliForAgent("claude-advisor", "anthropic/claude-opus-4-6", false)).toBe(true);
	});

	it("routes generic Claude-family agents through Claude CLI regardless of overlay", () => {
		expect(shouldUseClaudeCliForAgent("reviewer", "anthropic/claude-opus-4-6", true)).toBe(true);
		expect(shouldUseClaudeCliForAgent("reviewer", "anthropic/claude-opus-4-6", false)).toBe(true);
		expect(shouldUseClaudeCliForAgent("builder", "anthropic/claude-haiku-4-5", false)).toBe(true);
		expect(shouldUseClaudeCliForAgent("builder", "openai/gpt-5.4", true)).toBe(false);
	});

	it("maps Opus-class generic roles to advisor profile", () => {
		expect(resolveClaudeProfileForAgent("reviewer", "anthropic/claude-opus-4-6")).toBe("claude-advisor");
		expect(resolveClaudeProfileForAgent("builder", "anthropic/claude-haiku-4-5")).toBe("claude-worker");
	});
});
