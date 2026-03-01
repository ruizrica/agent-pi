// ABOUTME: Tests for the pure mode-cycling logic (nextMode, prevMode, modeLabel).
// ABOUTME: Validates cycle order, wrapping, and label formatting.

import { describe, it, expect } from "vitest";
import { MODES, nextMode, prevMode, modeLabel, modeColor, modeTextAnsi } from "../lib/mode-cycler-logic.ts";

describe("MODES", () => {
	it("has exactly 6 entries in correct order", () => {
		expect(MODES).toEqual(["NORMAL", "PLAN", "SPEC", "PIPELINE", "TEAM", "CHAIN"]);
	});
});

describe("nextMode", () => {
	it("cycles NORMAL → PLAN", () => {
		expect(nextMode("NORMAL")).toBe("PLAN");
	});

	it("cycles PLAN → SPEC", () => {
		expect(nextMode("PLAN")).toBe("SPEC");
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

	it("returns thinkingText for SPEC", () => {
		expect(modeColor("SPEC")).toBe("thinkingText");
	});

	it("returns success for PIPELINE", () => {
		expect(modeColor("PIPELINE")).toBe("success");
	});

	it("returns warning for TEAM", () => {
		expect(modeColor("TEAM")).toBe("warning");
	});

	it("returns error for CHAIN", () => {
		expect(modeColor("CHAIN")).toBe("error");
	});
});

describe("modeTextAnsi", () => {
	it("returns empty string for NORMAL", () => {
		expect(modeTextAnsi("NORMAL")).toBe("");
	});

	it("returns bold white for PLAN (dark bg)", () => {
		expect(modeTextAnsi("PLAN")).toBe("\x1b[1;97m");
	});

	it("returns dark gray for SPEC (light bg)", () => {
		expect(modeTextAnsi("SPEC")).toBe("\x1b[1;30m");
	});

	it("returns dark gray for PIPELINE (light bg)", () => {
		expect(modeTextAnsi("PIPELINE")).toBe("\x1b[1;30m");
	});

	it("returns dark gray for TEAM (light bg)", () => {
		expect(modeTextAnsi("TEAM")).toBe("\x1b[1;30m");
	});

	it("returns bold white for CHAIN (dark bg)", () => {
		expect(modeTextAnsi("CHAIN")).toBe("\x1b[1;97m");
	});
});
