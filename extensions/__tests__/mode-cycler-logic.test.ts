// ABOUTME: Tests for the pure mode-cycling logic (nextMode, prevMode, modeLabel).
// ABOUTME: Validates cycle order, loop mode placement, wrapping, and label formatting.

import { describe, it, expect } from "vitest";
import { MODES, nextMode, prevMode, modeLabel, modeColor, modeTextAnsi, modeBgAnsi, modeDisplayName, modeHintBgAnsi, modeHintText, modeHintTextAnsi } from "../lib/mode-cycler-logic.ts";

describe("MODES", () => {
	it("has exactly 10 entries in correct order", () => {
		expect(MODES).toEqual(["NORMAL", "PLAN", "SPEC", "INVESTIGATE", "DEBUG", "IMPLEMENT", "GOAL", "TEAM", "CHAIN", "PIPELINE"]);
	});
});

describe("nextMode", () => {
	it("cycles NORMAL → PLAN", () => {
		expect(nextMode("NORMAL")).toBe("PLAN");
	});

	it("cycles PLAN → SPEC", () => {
		expect(nextMode("PLAN")).toBe("SPEC");
	});

	it("cycles SPEC → INVESTIGATE", () => {
		expect(nextMode("SPEC")).toBe("INVESTIGATE");
	});

	it("cycles INVESTIGATE → DEBUG", () => {
		expect(nextMode("INVESTIGATE")).toBe("DEBUG");
	});

	it("cycles DEBUG → IMPLEMENT", () => {
		expect(nextMode("DEBUG")).toBe("IMPLEMENT");
	});

	it("cycles IMPLEMENT → GOAL", () => {
		expect(nextMode("IMPLEMENT")).toBe("GOAL");
	});

	it("cycles GOAL → TEAM", () => {
		expect(nextMode("GOAL")).toBe("TEAM");
	});

	it("cycles TEAM → CHAIN", () => {
		expect(nextMode("TEAM")).toBe("CHAIN");
	});

	it("cycles CHAIN → PIPELINE", () => {
		expect(nextMode("CHAIN")).toBe("PIPELINE");
	});

	it("wraps PIPELINE → NORMAL", () => {
		expect(nextMode("PIPELINE")).toBe("NORMAL");
	});
});

describe("prevMode", () => {
	it("cycles PLAN → NORMAL", () => {
		expect(prevMode("PLAN")).toBe("NORMAL");
	});

	it("cycles SPEC → PLAN", () => {
		expect(prevMode("SPEC")).toBe("PLAN");
	});

	it("cycles INVESTIGATE → SPEC", () => {
		expect(prevMode("INVESTIGATE")).toBe("SPEC");
	});

	it("cycles DEBUG → INVESTIGATE", () => {
		expect(prevMode("DEBUG")).toBe("INVESTIGATE");
	});

	it("cycles IMPLEMENT → DEBUG", () => {
		expect(prevMode("IMPLEMENT")).toBe("DEBUG");
	});

	it("cycles GOAL → IMPLEMENT", () => {
		expect(prevMode("GOAL")).toBe("IMPLEMENT");
	});

	it("wraps NORMAL → PIPELINE", () => {
		expect(prevMode("NORMAL")).toBe("PIPELINE");
	});

	it("cycles CHAIN → TEAM", () => {
		expect(prevMode("CHAIN")).toBe("TEAM");
	});

	it("cycles PIPELINE → CHAIN", () => {
		expect(prevMode("PIPELINE")).toBe("CHAIN");
	});

});

describe("modeLabel", () => {
	it("returns empty string for NORMAL", () => {
		expect(modeLabel("NORMAL")).toBe("");
	});

	it("returns [PLAN] for PLAN", () => {
		expect(modeLabel("PLAN")).toBe("[PLAN]");
	});

	it("returns [GOAL] for GOAL", () => {
		expect(modeLabel("GOAL")).toBe("[GOAL]");
	});

	it("returns [SPEC] for SPEC", () => {
		expect(modeLabel("SPEC")).toBe("[SPEC]");
	});

	it("returns [DEBUG] for DEBUG", () => {
		expect(modeLabel("DEBUG")).toBe("[DEBUG]");
	});

	it("returns [IMPLEMENT] for IMPLEMENT", () => {
		expect(modeLabel("IMPLEMENT")).toBe("[IMPLEMENT]");
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

	it("returns accent for GOAL", () => {
		expect(modeColor("GOAL")).toBe("accent");
	});

	it("returns accent for SPEC", () => {
		expect(modeColor("SPEC")).toBe("accent");
	});

	it("returns accent for DEBUG", () => {
		expect(modeColor("DEBUG")).toBe("accent");
	});

	it("returns accent for IMPLEMENT", () => {
		expect(modeColor("IMPLEMENT")).toBe("accent");
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

	it("appends overlays for GOAL and IMPLEMENT when active", () => {
		expect(modeDisplayName("GOAL", { claude: true, gemma: false, qwen: false })).toBe("GOAL + CLAUDE");
		expect(modeDisplayName("GOAL", { claude: false, gemma: true, qwen: false })).toBe("GOAL + GEMMA");
		expect(modeDisplayName("GOAL", { claude: false, gemma: false, qwen: true })).toBe("GOAL + QWEN");
		expect(modeDisplayName("IMPLEMENT", { claude: true, gemma: false, qwen: false })).toBe("IMPLEMENT + CLAUDE");
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

	it("uses active background for GOAL and IMPLEMENT", () => {
		expect(modeBgAnsi("GOAL")).toBe("\x1b[48;2;30;144;255m");
		expect(modeBgAnsi("IMPLEMENT")).toBe("\x1b[48;2;30;144;255m");
	});

	it("uses flat yellow background for DEBUG", () => {
		expect(modeBgAnsi("DEBUG")).toBe("\x1b[48;2;255;214;10m");
	});
});

describe("modeTextAnsi", () => {
	it("returns empty string for NORMAL", () => {
		expect(modeTextAnsi("NORMAL")).toBe("");
	});

	it("returns bold white for PLAN (dark bg)", () => {
		expect(modeTextAnsi("PLAN")).toBe("\x1b[1;97m");
	});

	it("returns bold white for GOAL (blue bg)", () => {
		expect(modeTextAnsi("GOAL")).toBe("\x1b[1;97m");
	});

	it("returns bold white for SPEC (blue bg)", () => {
		expect(modeTextAnsi("SPEC")).toBe("\x1b[1;97m");
	});

	it("returns bold dark for DEBUG (yellow bg)", () => {
		expect(modeTextAnsi("DEBUG")).toBe("\x1b[1;30m");
	});

	it("returns bold white for IMPLEMENT (blue bg)", () => {
		expect(modeTextAnsi("IMPLEMENT")).toBe("\x1b[1;97m");
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

describe("mode hints", () => {
	it("defines guidance for every mode", () => {
		for (const mode of MODES) {
			expect(modeHintText(mode)).toEqual(expect.any(String));
			expect(modeHintText(mode).length).toBeGreaterThan(20);
		}
	});

	it("describes when to use key modes", () => {
		expect(modeHintText("NORMAL").toLowerCase()).toContain("default direct mode");
		expect(modeHintText("PLAN").toLowerCase()).toContain("planning");
		expect(modeHintText("SPEC").toLowerCase()).toContain("requirements");
		expect(modeHintText("INVESTIGATE").toLowerCase()).toContain("diagnose");
		expect(modeHintText("DEBUG").toLowerCase()).toContain("logging");
		expect(modeHintText("GOAL").toLowerCase()).toContain("success condition");
		expect(modeHintText("IMPLEMENT").toLowerCase()).toContain("task-board");
		expect(modeHintText("PIPELINE").toLowerCase()).toContain("phased");
		expect(modeHintText("TEAM").toLowerCase()).toContain("parallel specialists");
		expect(modeHintText("CHAIN").toLowerCase()).toContain("sequentially");
	});

	it("uses a contrasting hint background for active modes", () => {
		for (const mode of MODES.filter((m) => m !== "NORMAL")) {
			expect(modeHintBgAnsi(mode)).not.toBe(modeBgAnsi(mode));
		}
	});

	it("uses a neutral hint background for NORMAL", () => {
		expect(modeHintBgAnsi("NORMAL")).toBe("\x1b[48;2;32;36;44m");
		expect(modeHintBgAnsi("NORMAL")).not.toBe(modeBgAnsi("NORMAL"));
	});

	it("keeps overlay hint backgrounds distinct from overlay banner backgrounds", () => {
		const overlays = [
			{ claude: true, gemma: false, qwen: false },
			{ claude: false, gemma: true, qwen: false },
			{ claude: false, gemma: false, qwen: true },
		];
		for (const overlay of overlays) {
			expect(modeHintBgAnsi("PLAN", overlay)).not.toBe(modeBgAnsi("PLAN", overlay));
		}
	});

	it("uses readable text on hint rows", () => {
		expect(modeHintTextAnsi("PLAN")).toBe("\x1b[38;2;220;230;240m");
		expect(modeHintTextAnsi("NORMAL")).toBe("\x1b[38;2;220;230;240m");
	});
});
