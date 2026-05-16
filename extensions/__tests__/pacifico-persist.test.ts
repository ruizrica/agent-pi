// ABOUTME: Tests Pacifico settings persistence across current and legacy settings paths.
// ABOUTME: Ensures previously saved API keys in extensions/settings.json remain readable.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { loadPacificoApiKey, loadPacificoModel, persistPacificoApiKey, persistPacificoModel } from "../lib/persist-pacifico.ts";

describe("persist-pacifico", () => {
	let tmpDir: string;
	let primary: string;
	let legacy: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "pacifico-persist-"));
		primary = join(tmpDir, "settings.json");
		legacy = join(tmpDir, "extensions-settings.json");
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("loads a Pacifico API key from the legacy settings path", () => {
		writeFileSync(legacy, JSON.stringify({ pacificoApiKey: "  legacy-secret-value  " }, null, 2));

		expect(loadPacificoApiKey({ primary, legacy })).toBe("legacy-secret-value");
	});

	it("prefers the primary settings path over the legacy settings path", () => {
		writeFileSync(legacy, JSON.stringify({ pacificoApiKey: "legacy-secret-value", pacificoModel: "legacy-model" }, null, 2));
		writeFileSync(primary, JSON.stringify({ pacificoApiKey: "primary-secret-value", pacificoModel: "primary-model" }, null, 2));

		expect(loadPacificoApiKey({ primary, legacy })).toBe("primary-secret-value");
		expect(loadPacificoModel({ primary, legacy })).toBe("primary-model");
	});

	it("writes to the primary path while preserving legacy settings", () => {
		writeFileSync(legacy, JSON.stringify({ quietStartup: true, pacificoModel: "legacy-model" }, null, 2));

		persistPacificoApiKey("new-secret-value", { primary, legacy });

		expect(existsSync(primary)).toBe(true);
		const result = JSON.parse(readFileSync(primary, "utf-8"));
		expect(result.quietStartup).toBe(true);
		expect(result.pacificoModel).toBe("legacy-model");
		expect(result.pacificoApiKey).toBe("new-secret-value");
	});

	it("clears API key fields from the primary write output", () => {
		writeFileSync(legacy, JSON.stringify({ pacificoApiKey: "legacy-secret-value", harnessApiKey: "legacy-harness", pacificoModel: "legacy-model" }, null, 2));

		persistPacificoApiKey(null, { primary, legacy });

		const result = JSON.parse(readFileSync(primary, "utf-8"));
		expect(result.pacificoApiKey).toBeUndefined();
		expect(result.harnessApiKey).toBeUndefined();
		expect(result.pacificoModel).toBe("legacy-model");
	});

	it("persists model selections to the primary path", () => {
		persistPacificoModel("claude-haiku-4-5", { primary, legacy });

		expect(loadPacificoModel({ primary, legacy })).toBe("claude-haiku-4-5");
	});
});
