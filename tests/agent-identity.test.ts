// ABOUTME: Unit tests for agent identity resolution.
// Tests default fallback behavior, environment variable precedence, caching, and hostname normalization.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	resolveAgentName,
	resolveAgentType,
	resolveAgentRole,
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
	});

	afterEach(() => {
		// Restore original environment
		Object.assign(process.env, originalEnv);
		// Clean up cache
		__resetIdentityCacheForTests();
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
});
