// ABOUTME: Tests for buildNormalPrompt — the NORMAL mode system prompt that teaches autonomous mode selection.
// ABOUTME: Validates mode classification guidance, Commander integration, and chain/pipeline status reporting.

import { describe, it, expect } from "vitest";
import { buildNormalPrompt, buildCommanderSection } from "../lib/mode-prompts.ts";
import { getAdvisorOrchestrationPolicy } from "../lib/advisor-default-config.ts";

describe("buildNormalPrompt", () => {
	it("is a non-empty string", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null });
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
	});

	it("contains 'set_mode'", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null });
		expect(result).toContain("set_mode");
	});

	it("contains all 6 mode names", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null });
		for (const mode of ["NORMAL", "PLAN", "SPEC", "TEAM", "CHAIN", "PIPELINE"]) {
			expect(result).toContain(mode);
		}
	});

	it("with commanderAvailable: true, contains commander_task", () => {
		const result = buildNormalPrompt({ commanderAvailable: true, activeChain: null, activePipeline: null });
		expect(result).toContain("commander_task");
	});

	it("with commanderAvailable: false, does NOT contain commander_task", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null });
		expect(result).not.toContain("commander_task");
	});

	it("with activeChain set, contains chain name", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: "plan-build-review", activePipeline: null });
		expect(result).toContain("plan-build-review");
	});

	it("with activeChain: null, contains guidance about /chain", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null });
		expect(result).toContain("/chain");
	});

	it("with activePipeline set, contains pipeline name", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: "full-feature" });
		expect(result).toContain("full-feature");
	});

	it("with activePipeline: null, contains guidance about /pipeline", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null });
		expect(result).toContain("/pipeline");
	});

	it("contains task classification guidance (SIMPLE vs structured)", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null });
		expect(result.toLowerCase()).toContain("simple");
	});
});

describe("buildCommanderSection — Commander-first enforcement", () => {
	it("contains 'ALWAYS' to enforce Commander-first usage", () => {
		expect(buildCommanderSection()).toContain("ALWAYS");
	});
});

describe("buildNormalPrompt — Commander task guidance", () => {
	it("with commanderAvailable: true, mentions commander_mailbox in task guidance", () => {
		const result = buildNormalPrompt({ commanderAvailable: true, activeChain: null, activePipeline: null });
		expect(result).toContain("commander_mailbox");
	});

	it("with commanderAvailable: false, includes Commander-offline note", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null });
		expect(result.toLowerCase()).toContain("commander");
		expect(result.toLowerCase()).toContain("offline");
	});
});

describe("buildCommanderSection", () => {
	it("returns a non-empty string", () => {
		const result = buildCommanderSection();
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
	});

	it("contains commander_task", () => {
		expect(buildCommanderSection()).toContain("commander_task");
	});

	it("contains commander_task", () => {
		expect(buildCommanderSection()).toContain("commander_task");
	});

	it("contains commander_mailbox", () => {
		expect(buildCommanderSection()).toContain("commander_mailbox");
	});
});

describe("buildNormalPrompt — Scout delegation", () => {
	it("without scoutId, does not contain scout instructions", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null });
		expect(result).not.toContain("Scout Agent");
		expect(result).not.toContain("subagent_continue");
	});

	it("with scoutId: null, does not contain scout instructions", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null, scoutId: null });
		expect(result).not.toContain("Scout Agent");
		expect(result).not.toContain("subagent_continue");
	});

	it("with scoutId set, contains scout delegation section", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null, scoutId: 1 });
		expect(result).toContain("Scout Agent");
		expect(result).toContain("subagent_continue");
	});

	it("with scoutId set, references the correct SA ID", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null, scoutId: 42 });
		expect(result).toContain("SA42");
		expect(result).toContain("id: 42");
	});

	it("with scoutId set, instructs agent to delegate reads to scout", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null, scoutId: 1 });
		expect(result).toContain("delegate");
		expect(result.toLowerCase()).toContain("read");
	});

	it("with scoutId set, instructs agent to still handle edits directly", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null, scoutId: 1 });
		expect(result.toLowerCase()).toContain("edit");
		expect(result).toContain("YOU still do directly");
	});

	it("with scoutId set, mentions fallback if scout errors", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null, scoutId: 1 });
		expect(result.toLowerCase()).toContain("fall back");
	});
});

describe("buildNormalPrompt — Phase 2: Advisor-first orchestration policy", () => {
	it("imports and uses the advisor orchestration policy constants", () => {
		const policy = getAdvisorOrchestrationPolicy();
		expect(policy.advisorModel).toBe("claude-opus-4-6");
		expect(policy.preferredWorkerModel).toBe("grok-4.1-fast");
		expect(policy.maxWorkers).toBe(16);
		expect(policy.secondOpinionRole).toBe("red-team");
	});
});

describe("buildNormalPrompt — Phase 4/5: Advisor-first strategy and second-opinion policy", () => {
	it("falls back to the default advisor model when no selected model is provided", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null });
		expect(result).toContain("claude-opus-4-6");
	});

	it("uses the selected advisor model when provided", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null, selectedAdvisorModel: "gpt-5.4" });
		expect(result).toContain("gpt-5.4 advisor");
		expect(result).not.toContain("claude-opus-4-6 advisor");
	});

	it("references the preferred worker model grok-4.1-fast", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null });
		expect(result).toContain("grok-4.1-fast");
	});

	it("states workers are preferred for content gathering", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null });
		expect(result.toLowerCase()).toContain("workers are preferred for content gathering");
	});

	it("mentions up to 16 non-advisor agents for complex/parallel work", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null });
		expect(result.toLowerCase()).toMatch(/16\s+non-advisor|up to 16/i);
	});

	it("mentions a cross-provider second-opinion role", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null, selectedAdvisorModel: "claude-opus-4-6" });
		expect(result).toContain("different provider/model family");
		expect(result).toContain("openai-codex/gpt-5.4");
	});

	it("uses Anthropic/Opus as second opinion when the main advisor is GPT-family", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null, selectedAdvisorModel: "gpt-4.5" });
		expect(result).toContain("anthropic/claude-opus-4-6");
	});

	it("teaches that second opinion is optional, not mandatory", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null });
		expect(result.toLowerCase()).toMatch(/optional.*second.opinion|second.opinion.*optional/i);
	});

	it("explains that advisor should be consulted before substantive work", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null });
		expect(result.toLowerCase()).toMatch(/advisor.*before|consult.*advisor/i);
	});

	it("explains that advisor should be consulted when stuck or before declaring done", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null });
		expect(result.toLowerCase()).toMatch(/stuck|done.*substantial|completion/i);
	});

	it("distinguishes simple work (no advisor/workers) from complex work", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null });
		expect(result.toLowerCase()).toMatch(/simple.*direct|straightforward|single/i);
	});

	it("explains complexity-based decision rules for second opinion", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null });
		const complexity = result.toLowerCase().match(
			/complex|risk|ambig|architectural|high.impact/gi,
		);
		expect(complexity).toBeTruthy();
		expect(complexity!.length).toBeGreaterThan(1);
	});

	it("teaches subagent_create_batch for mixed worker/builder fan-out", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null });
		expect(result).toContain("subagent_create_batch");
		expect(result).toContain('name: "builder"');
		expect(result).toContain('name: "scout"');
	});

	it("explains when to fan out versus stay direct", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null });
		expect(result).toContain("When to Fan Out");
		expect(result).toContain("When NOT to Fan Out");
	});

	it("explains that advisor recommendation is primary input", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null });
		expect(result.toLowerCase()).toContain("advisor's recommendation");
		expect(result.toLowerCase()).toContain("primary input");
	});

	it("references claude_advisor tool for strategic consultation", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null });
		expect(result).toContain("claude_advisor");
	});

	it("provides examples of second-opinion triggers: architecture, security, ambiguity, integration", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null });
		const triggers = ["architectural", "security", "ambiguous", "integration", "compliance"];
		for (const trigger of triggers) {
			expect(result.toLowerCase()).toContain(trigger);
		}
	});
});
