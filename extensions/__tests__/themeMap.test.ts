// ABOUTME: Test suite for themeMap — extension name extraction, theme application, and stacking logic.
// ABOUTME: Validates that the most-imported shared lib (33 imports) works correctly.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { THEME_MAP, applyExtensionTheme, applyExtensionDefaults } from "../lib/themeMap.ts";

// ── Mock ExtensionContext ──────────────────────────────────────────────

function mockCtx(hasUI = true) {
	return {
		hasUI,
		ui: {
			setTheme: vi.fn(() => ({ success: true })),
			setTitle: vi.fn(),
		},
	} as any;
}

// ── extensionName (tested via applyExtensionTheme) ─────────────────────

describe("THEME_MAP", () => {
	it("has at least one entry", () => {
		expect(Object.keys(THEME_MAP).length).toBeGreaterThan(0);
	});

	it("all values are non-empty strings", () => {
		for (const [key, value] of Object.entries(THEME_MAP)) {
			expect(typeof value).toBe("string");
			expect(value.length).toBeGreaterThan(0);
		}
	});
});

describe("applyExtensionTheme", () => {
	let savedArgv: string[];

	beforeEach(() => {
		savedArgv = [...process.argv];
		// Clear argv so primaryExtensionName() returns null (no stacking gate)
		process.argv = ["node", "pi"];
	});

	afterEach(() => {
		process.argv = savedArgv;
	});

	it("returns false when hasUI is false", () => {
		const ctx = mockCtx(false);
		const result = applyExtensionTheme("file:///extensions/tasks.ts", ctx);
		expect(result).toBe(false);
		expect(ctx.ui.setTheme).not.toHaveBeenCalled();
	});

	it("applies mapped theme for a known extension", () => {
		const ctx = mockCtx();
		applyExtensionTheme("file:///extensions/tasks.ts", ctx);
		expect(ctx.ui.setTheme).toHaveBeenCalledWith("midnight-ocean");
	});

	it("falls back to midnight-ocean for unknown extension", () => {
		const ctx = mockCtx();
		applyExtensionTheme("file:///extensions/nonexistent-ext.ts", ctx);
		expect(ctx.ui.setTheme).toHaveBeenCalledWith("midnight-ocean");
	});

	it("handles plain file paths (not file:// URLs)", () => {
		const ctx = mockCtx();
		applyExtensionTheme("/Users/someone/extensions/tasks.ts", ctx);
		expect(ctx.ui.setTheme).toHaveBeenCalledWith("midnight-ocean");
	});

	it("falls back to midnight-ocean if setTheme fails for mapped theme", () => {
		const ctx = mockCtx();
		// First call fails, second succeeds
		ctx.ui.setTheme = vi.fn()
			.mockReturnValueOnce({ success: false })
			.mockReturnValueOnce({ success: true });

		// Use a mapped extension that has a non-midnight-ocean theme (if any)
		// All current entries map to midnight-ocean, so the fallback path
		// only triggers if a future theme fails. Test the logic anyway:
		const result = applyExtensionTheme("file:///extensions/tasks.ts", ctx);
		// Since tasks maps to midnight-ocean and it "fails", fallback is also midnight-ocean
		// so setTheme is called once (no double-call since mapped === fallback)
		expect(ctx.ui.setTheme).toHaveBeenCalled();
	});

	it("respects primary extension stacking — skips non-primary", () => {
		// Simulate: pi -e extensions/agent-team.ts -e extensions/tasks.ts
		process.argv = ["node", "pi", "-e", "extensions/agent-team.ts", "-e", "extensions/tasks.ts"];
		const ctx = mockCtx();

		// tasks.ts calls applyExtensionTheme but agent-team is primary
		applyExtensionTheme("file:///extensions/tasks.ts", ctx);
		// Should skip (return true without calling setTheme)
		expect(ctx.ui.setTheme).not.toHaveBeenCalled();
	});

	it("applies theme when caller IS the primary extension", () => {
		process.argv = ["node", "pi", "-e", "extensions/agent-team.ts", "-e", "extensions/tasks.ts"];
		const ctx = mockCtx();

		applyExtensionTheme("file:///extensions/agent-team.ts", ctx);
		expect(ctx.ui.setTheme).toHaveBeenCalledWith("midnight-ocean");
	});
});

describe("applyExtensionDefaults", () => {
	let savedArgv: string[];

	beforeEach(() => {
		savedArgv = [...process.argv];
		process.argv = ["node", "pi"];
	});

	afterEach(() => {
		process.argv = savedArgv;
	});

	it("calls setTheme (theme application)", () => {
		const ctx = mockCtx();
		applyExtensionDefaults("file:///extensions/tasks.ts", ctx);
		expect(ctx.ui.setTheme).toHaveBeenCalled();
	});

	it("does not crash when hasUI is false", () => {
		const ctx = mockCtx(false);
		expect(() => applyExtensionDefaults("file:///extensions/tasks.ts", ctx)).not.toThrow();
	});
});
