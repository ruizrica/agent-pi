// ABOUTME: Unit tests for commander CLI identity flag injection.
// Tests that cmd invocations are prefixed with --runtime and --model flags according to env vars.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	resolveModelName,
	resolveRuntimeLabel,
	applyCmdIdentityFlags,
	__resetIdentityCacheForTests,
} from "../extensions/agent-identity.js";

describe("commander CLI identity flags", () => {
	// Save and restore environment variables between tests
	const originalEnv = { ...process.env };

	beforeEach(() => {
		// Clear cache before each test
		__resetIdentityCacheForTests();
		// Reset env to clean state
		delete process.env.PI_MODEL;
		delete process.env.ANTHROPIC_MODEL;
		delete process.env.CLAUDE_MODEL;
		delete process.env.PI_RUNTIME_LABEL;
	});

	afterEach(() => {
		// Restore original environment
		Object.assign(process.env, originalEnv);
		// Clean up cache
		__resetIdentityCacheForTests();
	});

	describe("resolveModelName()", () => {
		it("returns 'unknown' when no model env vars are set", () => {
			const model = resolveModelName();
			expect(model).toBe("unknown");
		});

		it("prefers PI_MODEL over other env vars", () => {
			process.env.PI_MODEL = "claude-opus";
			process.env.ANTHROPIC_MODEL = "claude-haiku";
			process.env.CLAUDE_MODEL = "claude-3";

			const model = resolveModelName();
			expect(model).toBe("claude-opus");
		});

		it("uses ANTHROPIC_MODEL when PI_MODEL is not set", () => {
			process.env.ANTHROPIC_MODEL = "claude-haiku";
			process.env.CLAUDE_MODEL = "claude-3";

			const model = resolveModelName();
			expect(model).toBe("claude-haiku");
		});

		it("uses CLAUDE_MODEL as fallback", () => {
			process.env.CLAUDE_MODEL = "claude-3";

			const model = resolveModelName();
			expect(model).toBe("claude-3");
		});

		it("ignores whitespace-only model values and falls through", () => {
			process.env.PI_MODEL = "   ";
			process.env.ANTHROPIC_MODEL = "claude-haiku";

			const model = resolveModelName();
			expect(model).toBe("claude-haiku");
		});

		it("caches the model on first call", () => {
			process.env.PI_MODEL = "claude-opus";

			const firstCall = resolveModelName();

			// Change env after first call
			process.env.PI_MODEL = "claude-haiku";

			const secondCall = resolveModelName();

			// Should return cached value
			expect(secondCall).toBe(firstCall);
			expect(secondCall).toBe("claude-opus");
		});
	});

	describe("resolveRuntimeLabel()", () => {
		it("returns 'pi' by default", () => {
			const label = resolveRuntimeLabel();
			expect(label).toBe("pi");
		});

		it("uses PI_RUNTIME_LABEL when set", () => {
			process.env.PI_RUNTIME_LABEL = "claude-code";

			const label = resolveRuntimeLabel();
			expect(label).toBe("claude-code");
		});

		it("ignores whitespace-only PI_RUNTIME_LABEL and returns default", () => {
			process.env.PI_RUNTIME_LABEL = "   ";

			const label = resolveRuntimeLabel();
			expect(label).toBe("pi");
		});

		it("caches the runtime label on first call", () => {
			process.env.PI_RUNTIME_LABEL = "claude-code";

			const firstCall = resolveRuntimeLabel();

			// Change env after first call
			process.env.PI_RUNTIME_LABEL = "cursor";

			const secondCall = resolveRuntimeLabel();

			// Should return cached value
			expect(secondCall).toBe(firstCall);
			expect(secondCall).toBe("claude-code");
		});
	});

	describe("applyCmdIdentityFlags()", () => {
		// Identity flags are inserted AFTER the subcommand prefix (the first
		// min(2, args.length) args). This means `cmd task list --json` becomes
		// `cmd task list --runtime <label> --model <model> --json` — the cmd
		// binary sees identity flags after its subcommand, not before, which
		// is what its argv parser expects.

		it("inserts --runtime and --model flags after the subcommand prefix", () => {
			const args = ["task", "list", "--json"];
			const result = applyCmdIdentityFlags(args);

			expect(result).toEqual(["task", "list", "--runtime", "pi", "--model", "unknown", "--json"]);
		});

		it("uses resolved runtime label and model name", () => {
			process.env.PI_RUNTIME_LABEL = "claude-code";
			process.env.PI_MODEL = "claude-opus";

			const args = ["task", "claim", "123"];
			const result = applyCmdIdentityFlags(args);

			expect(result).toEqual([
				"task",
				"claim",
				"--runtime",
				"claude-code",
				"--model",
				"claude-opus",
				"123",
			]);
		});

		it("preserves the trailing original args after the identity flags", () => {
			const args = ["task", "show", "456", "--no-color"];
			const result = applyCmdIdentityFlags(args);

			// flags inserted at idx=2; everything after the prefix is the trailing argv
			expect(result.slice(0, 2)).toEqual(["task", "show"]);
			expect(result.slice(2, 6)).toEqual(["--runtime", "pi", "--model", "unknown"]);
			expect(result.slice(6)).toEqual(["456", "--no-color"]);
		});

		it("does not double-inject if args already contain --runtime", () => {
			const args = ["task", "list", "--runtime", "existing-runtime", "--model", "existing-model"];
			const result = applyCmdIdentityFlags(args);

			expect(result).toEqual(args);
		});

		it("handles empty args array (flags go first since there's no prefix)", () => {
			const args: string[] = [];
			const result = applyCmdIdentityFlags(args);

			expect(result).toEqual(["--runtime", "pi", "--model", "unknown"]);
		});

		it("handles single arg (flags inserted after that 1-arg prefix)", () => {
			const args = ["task"];
			const result = applyCmdIdentityFlags(args);

			expect(result).toEqual(["task", "--runtime", "pi", "--model", "unknown"]);
		});

		it("maintains correct order: <subcommand prefix> --runtime <label> --model <name> <tail>", () => {
			process.env.PI_RUNTIME_LABEL = "droid";
			process.env.ANTHROPIC_MODEL = "claude-sonnet";

			const args = ["mailbox", "send", "agent-name", "status", "message body"];
			const result = applyCmdIdentityFlags(args);

			expect(result).toEqual([
				"mailbox",
				"send",
				"--runtime",
				"droid",
				"--model",
				"claude-sonnet",
				"agent-name",
				"status",
				"message body",
			]);
		});
	});

	describe("identity consistency across functions", () => {
		it("ensures model and runtime label remain consistent across multiple calls", () => {
			const model1 = resolveModelName();
			const runtime1 = resolveRuntimeLabel();

			const model2 = resolveModelName();
			const runtime2 = resolveRuntimeLabel();

			expect(model2).toBe(model1);
			expect(runtime2).toBe(runtime1);
		});

		it("uses the same model in applyCmdIdentityFlags as resolveModelName", () => {
			process.env.PI_MODEL = "claude-opus";

			const model = resolveModelName();
			const args = applyCmdIdentityFlags(["task", "list"]);

			// flags inserted at idx=2 → ["task","list","--runtime",label,"--model",model]
			expect(args[5]).toBe(model);
		});

		it("uses the same runtime label in applyCmdIdentityFlags as resolveRuntimeLabel", () => {
			process.env.PI_RUNTIME_LABEL = "gemini";

			const label = resolveRuntimeLabel();
			const args = applyCmdIdentityFlags(["task", "list"]);

			// flags inserted at idx=2 → ["task","list","--runtime",label,...]
			expect(args[3]).toBe(label);
		});
	});
});
