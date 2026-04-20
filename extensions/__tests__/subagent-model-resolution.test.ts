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
import { resolveToolkitWorkerModel, TOOLKIT_WORKER_MODEL } from "../lib/toolkit-cli.ts";
import {
	selectWorkerModel,
	PREFERRED_WORKER_MODEL,
	FALLBACK_WORKER_MODEL,
	type WorkerModelSelection,
} from "../lib/advisor-default-model-selection.ts";

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
			planner: { provider: "github-copilot", model: "gemini-3.1-pro-preview" },
			tester: { provider: "anthropic", model: "claude-haiku-4-5" },
			"red-team": { provider: "anthropic", model: "claude-haiku-4-5" },
			"codex-worker": { provider: "openai-codex", model: "gpt-5.4" },
			"opencode-worker": { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
			"claude-worker": { provider: "anthropic", model: "claude-haiku-4-5" },
			"claude-advisor": { provider: "anthropic", model: "claude-opus-4-6" },
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

	it("resolves planner to github-copilot/gemini-3.1-pro-preview", () => {
		expect(resolveAgentModelString("planner", config)).toBe("github-copilot/gemini-3.1-pro-preview");
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
		return resolveToolkitWorkerModel(
			agentName,
			callerModel || agentDef?.model || configModel || buildModelString(config.default),
		);
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
		it("uses github-copilot/gemini-3.1-pro-preview from models.json", () => {
			expect(resolveModel(undefined, "PLANNER")).toBe("github-copilot/gemini-3.1-pro-preview");
		});
	});

	describe("toolkit agents", () => {
		it("force toolkit agents onto the shared worker model", () => {
			expect(resolveModel(undefined, "CODEX-WORKER")).toBe(TOOLKIT_WORKER_MODEL);
			expect(resolveModel(undefined, "CODEX-AGENT")).toBe(TOOLKIT_WORKER_MODEL);
			expect(resolveModel(undefined, "OPENCODE-WORKER")).toBe(TOOLKIT_WORKER_MODEL);
			expect(resolveModel(undefined, "OPENCODE-AGENT")).toBe(TOOLKIT_WORKER_MODEL);
		});

		it("preserve Claude profile models", () => {
			expect(resolveModel(undefined, "CLAUDE-WORKER")).toBe("anthropic/claude-haiku-4-5");
			expect(resolveModel(undefined, "CLAUDE-ADVISOR")).toBe("anthropic/claude-opus-4-6");
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

	it("legacy toolkit aliases resolve to worker defs when present", () => {
		knownAgents.set("codex-worker", {
			name: "codex-worker",
			description: "codex worker",
			tools: "read,write,edit,bash,grep,find,ls",
			model: "anthropic/claude-haiku-4-5-20251001",
			systemPrompt: "You are a codex worker.",
			file: "/path/to/codex-worker.md",
		});
		expect(resolveAgentByName("CODEX-AGENT", knownAgents)?.name).toBe("codex-worker");
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

// ── Worker Model Selection (Phase 3) ─────────────────────────────────────────

describe("selectWorkerModel — grok-4.1-fast preference with fallback", () => {
	it("returns a WorkerModelSelection object", () => {
		const result = selectWorkerModel();
		expect(result).toHaveProperty("model");
		expect(result).toHaveProperty("fallbackUsed");
		expect(result).toHaveProperty("message");
	});

	it("prefers x-ai/grok-4.1-fast when no availability check", () => {
		const result = selectWorkerModel();
		expect(result.model).toBe(PREFERRED_WORKER_MODEL);
		expect(result.fallbackUsed).toBe(false);
		expect(result.message).toContain(PREFERRED_WORKER_MODEL);
	});

	it("uses preferred model when available in Set", () => {
		const available = new Set([PREFERRED_WORKER_MODEL, "anthropic/claude-sonnet-4-20250514"]);
		const result = selectWorkerModel(available);
		expect(result.model).toBe(PREFERRED_WORKER_MODEL);
		expect(result.fallbackUsed).toBe(false);
	});

	it("uses preferred model when available in array", () => {
		const available = [PREFERRED_WORKER_MODEL, "anthropic/claude-sonnet-4-20250514"];
		const result = selectWorkerModel(available);
		expect(result.model).toBe(PREFERRED_WORKER_MODEL);
		expect(result.fallbackUsed).toBe(false);
	});

	it("falls back to haiku when preferred is unavailable", () => {
		const available = new Set(["anthropic/claude-sonnet-4-20250514", "anthropic/claude-opus-4-6"]);
		const result = selectWorkerModel(available);
		expect(result.model).toBe(FALLBACK_WORKER_MODEL);
		expect(result.fallbackUsed).toBe(true);
		expect(result.message).toContain("unavailable");
		expect(result.message).toContain("fallback");
	});

	it("uses fallback when available set is empty", () => {
		const available = new Set<string>();
		const result = selectWorkerModel(available);
		expect(result.model).toBe(FALLBACK_WORKER_MODEL);
		expect(result.fallbackUsed).toBe(true);
	});

	it("uses fallback when available array is empty", () => {
		const result = selectWorkerModel([]);
		expect(result.model).toBe(FALLBACK_WORKER_MODEL);
		expect(result.fallbackUsed).toBe(true);
	});

	it("accepts preferred override: true to force preferred", () => {
		const available = new Set([
			"anthropic/claude-sonnet-4-20250514", // deliberately exclude preferred
		]);
		const result = selectWorkerModel(available, true);
		expect(result.model).toBe(PREFERRED_WORKER_MODEL);
		expect(result.fallbackUsed).toBe(false);
		expect(result.message).toContain("explicit override");
	});

	it("accepts preferred override: false to force fallback", () => {
		const available = new Set([PREFERRED_WORKER_MODEL]);
		const result = selectWorkerModel(available, false);
		expect(result.model).toBe(FALLBACK_WORKER_MODEL);
		expect(result.fallbackUsed).toBe(true);
		expect(result.message).toContain("explicit override");
	});

	it("message includes model string when preferred available", () => {
		const result = selectWorkerModel(new Set([PREFERRED_WORKER_MODEL]));
		expect(result.message).toContain(PREFERRED_WORKER_MODEL);
	});

	it("message includes both preferred and fallback when fallback triggered", () => {
		const result = selectWorkerModel(new Set(["other/model"]));
		expect(result.message).toContain(FALLBACK_WORKER_MODEL);
		expect(result.message).toContain(PREFERRED_WORKER_MODEL);
	});
});
