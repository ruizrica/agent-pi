// ABOUTME: Tests for the pure mode-cycling logic (nextMode, prevMode, modeLabel).
// ABOUTME: Validates cycle order, wrapping, and label formatting.

import { describe, it, expect } from "vitest";
import { MODES, nextMode, prevMode, modeLabel, modeColor, modeTextAnsi, modeBgAnsi, modeDisplayName } from "../lib/mode-cycler-logic.ts";

describe("MODES", () => {
	it("has exactly 7 entries in correct order", () => {
		expect(MODES).toEqual(["NORMAL", "PLAN", "INVESTIGATE", "SPEC", "PIPELINE", "TEAM", "CHAIN"]);
	});
});

describe("nextMode", () => {
	it("cycles NORMAL → PLAN", () => {
		expect(nextMode("NORMAL")).toBe("PLAN");
	});

	it("cycles PLAN → INVESTIGATE", () => {
		expect(nextMode("PLAN")).toBe("INVESTIGATE");
	});

	it("cycles INVESTIGATE → SPEC", () => {
		expect(nextMode("INVESTIGATE")).toBe("SPEC");
	});

	it("cycles SPEC → PIPELINE", () => {
		expect(nextMode("SPEC")).toBe("PIPELINE");
	});

	it("cycles PIPELINE → TEAM", () => {
		expect(nextMode("PIPELINE")).toBe("TEAM");
	});

	it("cycles TEAM → CHAIN", () => {
		expect(nextMode("TEAM")).toBe("CHAIN");
	});

	it("wraps CHAIN → NORMAL", () => {
		expect(nextMode("CHAIN")).toBe("NORMAL");
	});
});

describe("prevMode", () => {
	it("cycles PLAN → NORMAL", () => {
		expect(prevMode("PLAN")).toBe("NORMAL");
	});

	it("cycles INVESTIGATE → PLAN", () => {
		expect(prevMode("INVESTIGATE")).toBe("PLAN");
	});

	it("cycles SPEC → INVESTIGATE", () => {
		expect(prevMode("SPEC")).toBe("INVESTIGATE");
	});

	it("wraps NORMAL → CHAIN", () => {
		expect(prevMode("NORMAL")).toBe("CHAIN");
	});

	it("cycles CHAIN → TEAM", () => {
		expect(prevMode("CHAIN")).toBe("TEAM");
	});
});

describe("modeLabel", () => {
	it("returns empty string for NORMAL", () => {
		expect(modeLabel("NORMAL")).toBe("");
	});

	it("returns [PLAN] for PLAN", () => {
		expect(modeLabel("PLAN")).toBe("[PLAN]");
	});

	it("returns [INVESTIGATE] for INVESTIGATE", () => {
		expect(modeLabel("INVESTIGATE")).toBe("[INVESTIGATE]");
	});

	it("returns [SPEC] for SPEC", () => {
		expect(modeLabel("SPEC")).toBe("[SPEC]");
	});

	it("returns [PIPELINE] for PIPELINE", () => {
		expect(modeLabel("PIPELINE")).toBe("[PIPELINE]");
	});

	it("returns [TEAM] for TEAM", () => {
		expect(modeLabel("TEAM")).toBe("[TEAM]");
	});

	it("returns [CHAIN] for CHAIN", () => {
		expect(modeLabel("CHAIN")).toBe("[CHAIN]");
	});
});

describe("modeColor", () => {
	it("returns empty string for NORMAL", () => {
		expect(modeColor("NORMAL")).toBe("");
	});

	it("returns accent for PLAN", () => {
		expect(modeColor("PLAN")).toBe("accent");
	});

	it("returns accent for INVESTIGATE", () => {
		expect(modeColor("INVESTIGATE")).toBe("accent");
	});

	it("returns accent for SPEC", () => {
		expect(modeColor("SPEC")).toBe("accent");
	});

	it("returns accent for PIPELINE", () => {
		expect(modeColor("PIPELINE")).toBe("accent");
	});

	it("returns accent for TEAM", () => {
		expect(modeColor("TEAM")).toBe("accent");
	});

	it("returns accent for CHAIN", () => {
		expect(modeColor("CHAIN")).toBe("accent");
	});
});

describe("modeDisplayName", () => {
	it("appends + CLAUDE when overlay is active", () => {
		expect(modeDisplayName("PLAN", { claude: true, gemma: false, qwen: false })).toBe("PLAN + CLAUDE");
		expect(modeDisplayName("NORMAL", { claude: true, gemma: false, qwen: false })).toBe("NORMAL");
	});

	it("appends + GEMMA when overlay is active", () => {
		expect(modeDisplayName("PLAN", { claude: false, gemma: true, qwen: false })).toBe("PLAN + GEMMA");
	});

	it("appends + QWEN when overlay is active", () => {
		expect(modeDisplayName("PLAN", { claude: false, gemma: false, qwen: true })).toBe("PLAN + QWEN");
	});
});

describe("modeLabel overlay", () => {
	it("uses overlay-aware labels for active modes", () => {
		expect(modeLabel("PLAN", { claude: true, gemma: false, qwen: false })).toBe("[PLAN + CLAUDE]");
		expect(modeLabel("PLAN", { claude: false, gemma: true, qwen: false })).toBe("[PLAN + GEMMA]");
		expect(modeLabel("PLAN", { claude: false, gemma: false, qwen: true })).toBe("[PLAN + QWEN]");
		expect(modeLabel("NORMAL", { claude: true, gemma: false, qwen: false })).toBe("");
	});
});

describe("modeBgAnsi overlay", () => {
	it("uses dark orange for active modes when Claude overlay is enabled", () => {
		expect(modeBgAnsi("PLAN", { claude: true, gemma: false, qwen: false })).toBe("\x1b[48;2;180;90;0m");
		expect(modeBgAnsi("NORMAL", { claude: true, gemma: false, qwen: false })).toBe("");
	});

	it("uses green for active modes when Gemma overlay is enabled", () => {
		expect(modeBgAnsi("PLAN", { claude: false, gemma: true, qwen: false })).toBe("\x1b[48;2;20;140;80m");
	});

	it("uses purple for active modes when Qwen overlay is enabled", () => {
		expect(modeBgAnsi("PLAN", { claude: false, gemma: false, qwen: true })).toBe("\x1b[48;2;102;51;153m");
	});
});

describe("modeTextAnsi", () => {
	it("returns empty string for NORMAL", () => {
		expect(modeTextAnsi("NORMAL")).toBe("");
	});

	it("returns bold white for PLAN (dark bg)", () => {
		expect(modeTextAnsi("PLAN")).toBe("\x1b[1;97m");
	});

	it("returns bold white for INVESTIGATE (blue bg)", () => {
		expect(modeTextAnsi("INVESTIGATE")).toBe("\x1b[1;97m");
	});

	it("returns bold white for SPEC (blue bg)", () => {
		expect(modeTextAnsi("SPEC")).toBe("\x1b[1;97m");
	});

	it("returns bold white for PIPELINE (blue bg)", () => {
		expect(modeTextAnsi("PIPELINE")).toBe("\x1b[1;97m");
	});

	it("returns bold white for TEAM (blue bg)", () => {
		expect(modeTextAnsi("TEAM")).toBe("\x1b[1;97m");
	});

	it("returns bold white for CHAIN (blue bg)", () => {
		expect(modeTextAnsi("CHAIN")).toBe("\x1b[1;97m");
	});
});
