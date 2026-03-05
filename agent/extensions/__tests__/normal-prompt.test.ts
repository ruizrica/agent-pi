// ABOUTME: Tests for buildNormalPrompt — the NORMAL mode system prompt that teaches autonomous mode selection.
// ABOUTME: Validates mode classification guidance, Commander integration, and chain/pipeline status reporting.

import { describe, it, expect } from "vitest";
import { buildNormalPrompt, buildCommanderSection } from "../lib/mode-prompts.ts";

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

	it("with commanderAvailable: true, contains commander_session and file:open", () => {
		const result = buildNormalPrompt({ commanderAvailable: true, activeChain: null, activePipeline: null });
		expect(result).toContain("commander_session");
		expect(result).toContain("file:open");
	});

	it("with commanderAvailable: false, does NOT contain commander_session", () => {
		const result = buildNormalPrompt({ commanderAvailable: false, activeChain: null, activePipeline: null });
		expect(result).not.toContain("commander_session");
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

	it("contains commander_session", () => {
		expect(buildCommanderSection()).toContain("commander_session");
	});

	it("contains file:open", () => {
		expect(buildCommanderSection()).toContain("file:open");
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
