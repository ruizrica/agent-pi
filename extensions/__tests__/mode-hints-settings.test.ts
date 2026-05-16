// ABOUTME: Tests for operational mode hint preference resolution and persistence.
// ABOUTME: Ensures hints default on while env/settings overrides are honored safely.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { MODE_HINTS_ENV, parseModeHintsBoolean, persistModeHintsEnabled, resolveModeHintsEnabled } from "../lib/mode-hints-settings.ts";

describe("parseModeHintsBoolean", () => {
	it("parses common enabled values", () => {
		for (const value of [true, "true", "1", "on", "yes", "enabled"]) {
			expect(parseModeHintsBoolean(value)).toBe(true);
		}
	});

	it("parses common disabled values", () => {
		for (const value of [false, "false", "0", "off", "no", "disabled"]) {
			expect(parseModeHintsBoolean(value)).toBe(false);
		}
	});

	it("returns null for unknown values", () => {
		expect(parseModeHintsBoolean("maybe")).toBeNull();
		expect(parseModeHintsBoolean(undefined)).toBeNull();
		expect(parseModeHintsBoolean(1)).toBeNull();
	});
});

describe("mode hints settings", () => {
	let tmpDir: string;
	let settingsPath: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "mode-hints-settings-"));
		settingsPath = join(tmpDir, "settings.json");
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("defaults to enabled", () => {
		expect(resolveModeHintsEnabled(settingsPath, {})).toBe(true);
	});

	it("uses environment override before settings", () => {
		writeFileSync(settingsPath, JSON.stringify({ modeHintsEnabled: true }, null, 2));
		expect(resolveModeHintsEnabled(settingsPath, { [MODE_HINTS_ENV]: "off" })).toBe(false);
		expect(resolveModeHintsEnabled(settingsPath, { [MODE_HINTS_ENV]: "on" })).toBe(true);
	});

	it("reads settings when env is unset", () => {
		writeFileSync(settingsPath, JSON.stringify({ modeHintsEnabled: false }, null, 2));
		expect(resolveModeHintsEnabled(settingsPath, {})).toBe(false);
	});

	it("preserves unrelated settings fields when persisting", () => {
		writeFileSync(settingsPath, JSON.stringify({ quietStartup: true, theme: "dracula" }, null, 2));

		persistModeHintsEnabled(false, settingsPath);

		const result = JSON.parse(readFileSync(settingsPath, "utf-8"));
		expect(result.modeHintsEnabled).toBe(false);
		expect(result.quietStartup).toBe(true);
		expect(result.theme).toBe("dracula");
	});

	it("does not throw when settings are missing or invalid", () => {
		expect(() => persistModeHintsEnabled(true, settingsPath)).not.toThrow();
		writeFileSync(settingsPath, "not json {{{");
		expect(() => persistModeHintsEnabled(false, settingsPath)).not.toThrow();
		expect(JSON.parse(readFileSync(settingsPath, "utf-8")).modeHintsEnabled).toBe(false);
	});
});
