// ABOUTME: Source-level tests for operational mode hint UI wiring.
// ABOUTME: Verifies mode-cycler renders temporary hints and exposes the toggle command.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const source = readFileSync(join(__dirname, "..", "mode-cycler.ts"), "utf-8");

describe("mode-cycler mode hints", () => {
	it("uses a four-second auto-dismiss timer", () => {
		expect(source).toContain("MODE_HINT_DURATION_MS = 4000");
		expect(source).toContain("setTimeout(() =>");
		expect(source).toContain("dismissModeHint(ctx)");
	});

	it("renders hint rows inside the mode-block widget", () => {
		expect(source).toContain("renderModeBlockRows(mode, width)");
		expect(source).toContain("modeHintBgAnsi(mode, currentOverlay)");
		expect(source).toContain("modeHintText(mode)");
		expect(source).toContain("modeHintVisible && modeHintsEnabled");
	});

	it("word-wraps hint text into padded rows", () => {
		expect(source).toContain('import { wordWrap } from "./lib/ui-helpers.ts"');
		expect(source).toContain("MODE_HINT_HORIZONTAL_PADDING = 2");
		expect(source).toContain("renderWrappedHintRows");
		expect(source).toContain("const contentWidth = Math.max(1, width - MODE_HINT_HORIZONTAL_PADDING * 2)");
		expect(source).toContain("wordWrap(modeHintText(mode), contentWidth)");
		expect(source).toContain("...wrappedLines.map((line) => padAnsiRow");
		expect(source).not.toContain("rows.push(padAnsiRow(hintBg, hintText, `  ${modeHintText(mode)}`, width));");
	});

	it("requests hints from user and tool mode-selection paths", () => {
		expect(source).toContain("setMode(nextMode(currentMode), ctx, { showHint: true })");
		expect(source).toContain("setMode(arg as Mode, ctx, { showHint: true })");
		expect(source).toContain("setMode(upper as Mode, ctx, { showHint: true })");
		expect(source).toContain("setMode(mode, ctx, { showHint: true })");
	});

	it("registers a slash command for toggling mode hints", () => {
		expect(source).toContain('pi.registerCommand("mode-hints"');
		expect(source).toContain("persistModeHintsEnabled(next)");
		expect(source).toContain("Mode hints are");
	});

	it("clears NORMAL mode back to the regular no-banner view after dismissal", () => {
		expect(source).toContain('ctx.ui.setWidget("mode-block", undefined)');
		expect(source).toContain('mode !== "NORMAL" || (modeHintVisible && modeHintsEnabled)');
	});
});
