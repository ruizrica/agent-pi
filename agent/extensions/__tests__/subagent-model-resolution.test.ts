// ABOUTME: Tests that subagent_create resolves models from models.json config.
// ABOUTME: Verifies the 3-tier priority: caller override > models.json agent > models.json default.

import { describe, it, expect } from "vitest";
import {
	resolveAgentByName,
	resolveAgentModelString,
	buildModelString,
	loadAgentModelsConfig,
	type AgentDef,
	type AgentModelsConfig,
} from "../lib/agent-defs.ts";

// ── Test fixtures ────────────────────────────────────────────────────────────

function makeModelsConfig(): AgentModelsConfig {
	return {
		default: {
			provider: "anthropic",
			model: "claude-haiku-4-5-20251001",
		},
		agents: {
			scout: { provider: "x-ai", model: "grok-4.1-fast" },
			builder: { provider: "mercury", model: "mercury-2" },
			reviewer: { provider: "anthropic", model: "claude-opus-4-6" },
			planner: { provider: "google", model: "gemini-3.1-pro-preview" },
			tester: { provider: "anthropic", model: "claude-haiku-4-5" },
			"red-team": { provider: "anthropic", model: "claude-haiku-4-5" },
		},
	};
}

function makeKnownAgents(config: AgentModelsConfig): Map<string, AgentDef> {
	const agents = new Map<string, AgentDef>();
	for (const [name, entry] of Object.entries(config.agents)) {
		agents.set(name, {
			name,
			description: `${name} agent`,
			tools: name === "builder" ? "read,write,edit,bash,grep,find,ls" : "read,grep,find,ls",
			model: buildModelString(entry),
			systemPrompt: `You are a ${name} agent.`,
			file: `/path/to/${name}.md`,
		});
	}
	return agents;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("buildModelString", () => {
	it("combines provider and model", () => {
		expect(buildModelString({ provider: "x-ai", model: "grok-4.1-fast" }))
			.toBe("x-ai/grok-4.1-fast");
	});

	it("returns just model when provider is empty", () => {
		expect(buildModelString({ provider: "", model: "mercury-2" }))
			.toBe("mercury-2");
	});
});

describe("resolveAgentModelString", () => {
	const config = makeModelsConfig();

	it("resolves scout to x-ai/grok-4.1-fast", () => {
		expect(resolveAgentModelString("scout", config)).toBe("x-ai/grok-4.1-fast");
	});

	it("resolves builder to mercury/mercury-2", () => {
		expect(resolveAgentModelString("builder", config)).toBe("mercury/mercury-2");
	});

	it("resolves reviewer to anthropic/claude-opus-4-6", () => {
		expect(resolveAgentModelString("reviewer", config)).toBe("anthropic/claude-opus-4-6");
	});

	it("resolves planner to google/gemini-3.1-pro-preview", () => {
		expect(resolveAgentModelString("planner", config)).toBe("google/gemini-3.1-pro-preview");
	});

	it("is case-insensitive", () => {
		expect(resolveAgentModelString("SCOUT", config)).toBe("x-ai/grok-4.1-fast");
		expect(resolveAgentModelString("Builder", config)).toBe("mercury/mercury-2");
	});

	it("falls back to default for unknown agents", () => {
		expect(resolveAgentModelString("unknown-agent", config))
			.toBe("anthropic/claude-haiku-4-5-20251001");
	});
});

describe("subagent model resolution (end-to-end)", () => {
	const config = makeModelsConfig();
	const knownAgents = makeKnownAgents(config);

	/**
	 * Mirrors the resolution logic from subagent-widget.ts spawnAgent().
	 * Priority: 1) caller override, 2) agent def model, 3) config model, 4) default
	 */
	function resolveModel(
		callerModel: string | undefined,
		agentName: string,
	): string {
		const agentDef = resolveAgentByName(agentName, knownAgents);
		const configModel = resolveAgentModelString(agentName, config);
		return callerModel || agentDef?.model || configModel || buildModelString(config.default);
	}

	describe("SCOUT agent", () => {
		it("uses x-ai/grok-4.1-fast from models.json when no override", () => {
			expect(resolveModel(undefined, "SCOUT")).toBe("x-ai/grok-4.1-fast");
		});

		it("caller override wins over config", () => {
			expect(resolveModel("anthropic/claude-sonnet-4-20250514", "SCOUT"))
				.toBe("anthropic/claude-sonnet-4-20250514");
		});
	});

	describe("BUILDER agent", () => {
		it("uses mercury/mercury-2 from models.json", () => {
			expect(resolveModel(undefined, "BUILDER")).toBe("mercury/mercury-2");
		});
	});

	describe("REVIEWER agent", () => {
		it("uses anthropic/claude-opus-4-6 from models.json", () => {
			expect(resolveModel(undefined, "REVIEWER")).toBe("anthropic/claude-opus-4-6");
		});
	});

	describe("PLANNER agent", () => {
		it("uses google/gemini-3.1-pro-preview from models.json", () => {
			expect(resolveModel(undefined, "PLANNER")).toBe("google/gemini-3.1-pro-preview");
		});
	});

	describe("unknown agent name", () => {
		it("falls back to default from models.json", () => {
			expect(resolveModel(undefined, "RANDOM-AGENT"))
				.toBe("anthropic/claude-haiku-4-5-20251001");
		});

		it("uses caller model when provided", () => {
			expect(resolveModel("openai/gpt-4o", "RANDOM-AGENT")).toBe("openai/gpt-4o");
		});
	});

	describe("empty string caller model", () => {
		it("does NOT override — falls through to agent def", () => {
			expect(resolveModel("", "SCOUT")).toBe("x-ai/grok-4.1-fast");
		});
	});
});

describe("tools resolution from agent defs", () => {
	const config = makeModelsConfig();
	const knownAgents = makeKnownAgents(config);

	it("scout gets read-only tools", () => {
		expect(resolveAgentByName("SCOUT", knownAgents)?.tools).toBe("read,grep,find,ls");
	});

	it("builder gets full tools", () => {
		expect(resolveAgentByName("BUILDER", knownAgents)?.tools)
			.toBe("read,write,edit,bash,grep,find,ls");
	});

	it("unknown agent returns undefined", () => {
		expect(resolveAgentByName("UNKNOWN", knownAgents)).toBeUndefined();
	});
});

describe("loadAgentModelsConfig", () => {
	it("returns hardcoded default when no config file exists", () => {
		const config = loadAgentModelsConfig("/nonexistent/path");
		expect(config.default.provider).toBe("anthropic");
		expect(config.default.model).toBe("claude-haiku-4-5-20251001");
		expect(Object.keys(config.agents)).toHaveLength(0);
	});
});
