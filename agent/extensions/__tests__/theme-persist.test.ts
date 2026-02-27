// ABOUTME: Tests for persistTheme helper from theme-cycler.ts
// Verifies theme name is written to settings.json without corrupting other fields

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { persistTheme } from "../lib/persist-theme.ts";

describe("persistTheme", () => {
	let tmpDir: string;
	let settingsPath: string;

	const baseSettings = {
		quietStartup: true,
		theme: "midnight-ocean",
		transport: "sse",
		defaultProvider: "anthropic",
		packages: ["extensions/theme-cycler.ts"],
	};

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "theme-persist-"));
		settingsPath = join(tmpDir, "settings.json");
		writeFileSync(settingsPath, JSON.stringify(baseSettings, null, 2));
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("updates theme field in settings.json", () => {
		persistTheme("dracula", settingsPath);

		const result = JSON.parse(readFileSync(settingsPath, "utf-8"));
		expect(result.theme).toBe("dracula");
	});

	it("preserves all other fields", () => {
		persistTheme("dracula", settingsPath);

		const result = JSON.parse(readFileSync(settingsPath, "utf-8"));
		expect(result.quietStartup).toBe(true);
		expect(result.transport).toBe("sse");
		expect(result.defaultProvider).toBe("anthropic");
		expect(result.packages).toEqual(["extensions/theme-cycler.ts"]);
	});

	it("does not throw when settings file is missing", () => {
		expect(() => {
			persistTheme("dracula", join(tmpDir, "nonexistent.json"));
		}).not.toThrow();
	});

	it("does not throw when settings file contains invalid JSON", () => {
		writeFileSync(settingsPath, "not json {{{");

		expect(() => {
			persistTheme("dracula", settingsPath);
		}).not.toThrow();
	});

	it("is idempotent — writing same theme twice works", () => {
		persistTheme("dracula", settingsPath);
		persistTheme("dracula", settingsPath);

		const result = JSON.parse(readFileSync(settingsPath, "utf-8"));
		expect(result.theme).toBe("dracula");
	});
});
