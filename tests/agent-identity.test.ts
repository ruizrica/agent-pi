// ABOUTME: Unit tests for agent identity resolution.
// Tests default fallback behavior, environment variable precedence, caching, and hostname normalization.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import agentIdentityDefault, {
	resolveAgentName,
	resolveAgentType,
	resolveAgentRole,
	resolveModelName,
	resolveRuntimeLabel,
	applyCmdIdentityFlags,
	__resetIdentityCacheForTests,
} from "../extensions/agent-identity.js";

describe("agent-identity", () => {
	// Save and restore environment variables between tests
	const originalEnv = { ...process.env };

	beforeEach(() => {
		// Clear cache before each test
		__resetIdentityCacheForTests();
		// Reset env to clean state
		delete process.env.PI_AGENT_NAME;
		delete process.env.PI_SUBAGENT_NAME;
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

	describe("pi extension loader contract", () => {
		// The pi runtime auto-discovers every top-level .ts file in extensions/ and
		// requires each to default-export a factory (pi: ExtensionAPI) => void.
		// agent-identity.ts is a utility module, so its default export is a no-op
		// factory that exists purely to satisfy the loader.
		it("default-exports a function so pi can load it as an extension", () => {
			expect(typeof agentIdentityDefault).toBe("function");
		});

		it("default factory is a no-op (does not throw when invoked with a stub ExtensionAPI)", () => {
			const piStub = { on: () => {} } as unknown as Parameters<typeof agentIdentityDefault>[0];
			expect(() => agentIdentityDefault(piStub)).not.toThrow();
		});
	});

	describe("resolveAgentName()", () => {
		it("returns default fallback when no env vars set", () => {
			const name = resolveAgentName();

			// Pattern: pi-{shortHostname}-{pid}
			// Should match: pi-[a-zA-Z0-9-]+-<number>
			expect(name).toMatch(/^pi-[a-zA-Z0-9-]+-\d+$/);

			// Verify it includes the process ID
			expect(name).toContain(String(process.pid));
		});

		it("returns PI_AGENT_NAME value when set", () => {
			process.env.PI_AGENT_NAME = "my-coordinator";

			const name = resolveAgentName();
			expect(name).toBe("my-coordinator");
		});

		it("returns PI_SUBAGENT_NAME when set and PI_AGENT_NAME is not set", () => {
			process.env.PI_SUBAGENT_NAME = "my-subagent";

			const name = resolveAgentName();
			expect(name).toBe("my-subagent");
		});

		it("prefers PI_AGENT_NAME over PI_SUBAGENT_NAME when both set", () => {
			process.env.PI_AGENT_NAME = "coordinator-name";
			process.env.PI_SUBAGENT_NAME = "subagent-name";

			const name = resolveAgentName();
			expect(name).toBe("coordinator-name");
		});

		it("ignores whitespace-only env values and falls through", () => {
			process.env.PI_AGENT_NAME = "   ";
			process.env.PI_SUBAGENT_NAME = "my-subagent";

			const name = resolveAgentName();
			expect(name).toBe("my-subagent");
		});

		it("caches the name on first call; subsequent calls return same value", () => {
			const firstCall = resolveAgentName();

			// Change env after first call
			process.env.PI_AGENT_NAME = "changed-name";

			const secondCall = resolveAgentName();

			// Should return cached value, not the new env var
			expect(secondCall).toBe(firstCall);
			expect(secondCall).not.toBe("changed-name");
		});

		it("does not include .local suffix in default name", () => {
			// The function strips .local, .lan, .home from hostname
			// We can't easily mock os.hostname(), but we can verify the result doesn't contain these suffixes
			const name = resolveAgentName();

			expect(name).not.toContain(".local");
			expect(name).not.toContain(".lan");
			expect(name).not.toContain(".home");
		});
	});

	describe("resolveAgentType()", () => {
		it("returns 'pi-coordinator' for default fallback", () => {
			const agentType = resolveAgentType();
			expect(agentType).toBe("pi-coordinator");
		});

		it("returns 'pi-coordinator' when PI_AGENT_NAME is set", () => {
			process.env.PI_AGENT_NAME = "my-coordinator";

			const agentType = resolveAgentType();
			expect(agentType).toBe("pi-coordinator");
		});

		it("returns 'pi-subagent' when only PI_SUBAGENT_NAME is set", () => {
			process.env.PI_SUBAGENT_NAME = "my-subagent";

			const agentType = resolveAgentType();
			expect(agentType).toBe("pi-subagent");
		});

		it("returns 'pi-coordinator' when both PI_AGENT_NAME and PI_SUBAGENT_NAME are set", () => {
			process.env.PI_AGENT_NAME = "coordinator";
			process.env.PI_SUBAGENT_NAME = "subagent";

			const agentType = resolveAgentType();
			expect(agentType).toBe("pi-coordinator");
		});
	});

	describe("resolveAgentRole()", () => {
		it("returns 'coordinator' for default fallback", () => {
			const role = resolveAgentRole();
			expect(role).toBe("coordinator");
		});

		it("returns 'coordinator' when PI_AGENT_NAME is set", () => {
			process.env.PI_AGENT_NAME = "my-coordinator";

			const role = resolveAgentRole();
			expect(role).toBe("coordinator");
		});

		it("returns 'worker' when only PI_SUBAGENT_NAME is set", () => {
			process.env.PI_SUBAGENT_NAME = "my-subagent";

			const role = resolveAgentRole();
			expect(role).toBe("worker");
		});

		it("returns 'coordinator' when both PI_AGENT_NAME and PI_SUBAGENT_NAME are set", () => {
			process.env.PI_AGENT_NAME = "coordinator";
			process.env.PI_SUBAGENT_NAME = "subagent";

			const role = resolveAgentRole();
			expect(role).toBe("coordinator");
		});
	});

	describe("identity consistency", () => {
		it("ensures name, type, and role remain consistent across multiple calls", () => {
			const name1 = resolveAgentName();
			const type1 = resolveAgentType();
			const role1 = resolveAgentRole();

			// Call again without resetting cache
			const name2 = resolveAgentName();
			const type2 = resolveAgentType();
			const role2 = resolveAgentRole();

			expect(name2).toBe(name1);
			expect(type2).toBe(type1);
			expect(role2).toBe(role1);
		});

		it("maintains consistent state for coordinator identity", () => {
			process.env.PI_AGENT_NAME = "main-coordinator";

			const name = resolveAgentName();
			const type = resolveAgentType();
			const role = resolveAgentRole();

			expect(name).toBe("main-coordinator");
			expect(type).toBe("pi-coordinator");
			expect(role).toBe("coordinator");
		});

		it("maintains consistent state for subagent identity", () => {
			process.env.PI_SUBAGENT_NAME = "worker-1";

			const name = resolveAgentName();
			const type = resolveAgentType();
			const role = resolveAgentRole();

			expect(name).toBe("worker-1");
			expect(type).toBe("pi-subagent");
			expect(role).toBe("worker");
		});
	});

	describe("resolveModelName()", () => {
		it("returns 'unknown' when no model env vars are set", () => {
			const model = resolveModelName();
			expect(model).toBe("unknown");
		});

		it("prefers PI_MODEL over other env vars", () => {
			process.env.PI_MODEL = "claude-opus";
			process.env.ANTHROPIC_MODEL = "claude-haiku";

			const model = resolveModelName();
			expect(model).toBe("claude-opus");
		});

		it("uses ANTHROPIC_MODEL when PI_MODEL is not set", () => {
			process.env.ANTHROPIC_MODEL = "claude-haiku";

			const model = resolveModelName();
			expect(model).toBe("claude-haiku");
		});

		it("uses CLAUDE_MODEL as final fallback", () => {
			process.env.CLAUDE_MODEL = "claude-3";

			const model = resolveModelName();
			expect(model).toBe("claude-3");
		});

		it("ignores whitespace-only model values", () => {
			process.env.PI_MODEL = "   ";
			process.env.ANTHROPIC_MODEL = "claude-haiku";

			const model = resolveModelName();
			expect(model).toBe("claude-haiku");
		});

		it("caches the model on first call", () => {
			process.env.PI_MODEL = "claude-opus";

			const firstCall = resolveModelName();

			process.env.PI_MODEL = "claude-haiku";
			const secondCall = resolveModelName();

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

		it("ignores whitespace-only PI_RUNTIME_LABEL", () => {
			process.env.PI_RUNTIME_LABEL = "   ";

			const label = resolveRuntimeLabel();
			expect(label).toBe("pi");
		});

		it("caches the runtime label on first call", () => {
			process.env.PI_RUNTIME_LABEL = "claude-code";

			const firstCall = resolveRuntimeLabel();

			process.env.PI_RUNTIME_LABEL = "cursor";
			const secondCall = resolveRuntimeLabel();

			expect(secondCall).toBe(firstCall);
			expect(secondCall).toBe("claude-code");
		});
	});

	describe("applyCmdIdentityFlags()", () => {
		// Identity flags are inserted AFTER the subcommand prefix (first 2 args),
		// so the cmd binary sees `cmd task list --runtime ... --model ... --json`
		// instead of `cmd --runtime ... --model ... task list --json`.
		// Empty or 1-arg inputs put the flags at the start since there's no prefix.

		it("inserts --runtime and --model flags after the subcommand prefix", () => {
			const args = ["task", "list", "--json"];
			const result = applyCmdIdentityFlags(args);

			expect(result).toEqual(["task", "list", "--runtime", "pi", "--model", "unknown", "--json"]);
		});

		it("uses resolved values from env vars", () => {
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

		it("does not double-inject if args already contain --runtime", () => {
			const args = ["task", "list", "--runtime", "existing", "--model", "existing-model"];
			const result = applyCmdIdentityFlags(args);

			expect(result).toEqual(args);
		});

		it("handles empty args array (flags go first since there's no prefix)", () => {
			const args: string[] = [];
			const result = applyCmdIdentityFlags(args);

			expect(result).toEqual(["--runtime", "pi", "--model", "unknown"]);
		});

		it("maintains correct order with a long argv", () => {
			process.env.PI_RUNTIME_LABEL = "droid";
			process.env.ANTHROPIC_MODEL = "claude-sonnet";

			const args = ["mailbox", "send", "agent", "status", "msg"];
			const result = applyCmdIdentityFlags(args);

			expect(result).toEqual([
				"mailbox", "send",
				"--runtime", "droid",
				"--model", "claude-sonnet",
				"agent", "status", "msg",
			]);
		});
	});
});
