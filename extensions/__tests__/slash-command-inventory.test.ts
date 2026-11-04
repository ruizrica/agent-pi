// ABOUTME: Cross-surface slash-command inventory guard.
// ABOUTME: Prevents toolkit markdown commands from colliding with root extension commands.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { scanCommandDirs } from "../toolkit-commands.ts";

const EXTENSIONS_DIR = join(__dirname, "..");
const REPO_ROOT = resolve(EXTENSIONS_DIR, "..");
const COMMANDS_DIR = join(REPO_ROOT, "commands");

function rootExtensionFiles(): string[] {
	return readdirSync(EXTENSIONS_DIR)
		.filter((name) => name.endsWith(".ts"))
		.filter((name) => statSync(join(EXTENSIONS_DIR, name)).isFile())
		.sort();
}

function extractCommandNames(source: string): string[] {
	return [...source.matchAll(/\.registerCommand\s*\(\s*["']([^"']+)["']/g)].map((match) => match[1]);
}

function extensionCommandEntries(): Array<{ name: string; file: string; surface: "extension" }> {
	return rootExtensionFiles().flatMap((file) => {
		const source = readFileSync(join(EXTENSIONS_DIR, file), "utf8");
		return extractCommandNames(source).map((name) => ({ name, file: `extensions/${file}`, surface: "extension" as const }));
	});
}

function markdownCommandEntries(): Array<{ name: string; file: string; surface: "markdown" }> {
	return scanCommandDirs(COMMANDS_DIR).map((cmd) => ({
		name: cmd.name,
		file: cmd.file.replace(`${REPO_ROOT}/`, ""),
		surface: "markdown" as const,
	}));
}

function duplicateNames(entries: Array<{ name: string; file: string; surface: string }>): Record<string, string[]> {
	const byName = new Map<string, string[]>();
	for (const entry of entries) {
		const key = entry.name.toLowerCase();
		byName.set(key, [...(byName.get(key) ?? []), `${entry.surface}:${entry.file}`]);
	}
	return Object.fromEntries([...byName.entries()].filter(([, files]) => files.length > 1));
}

describe("slash command inventory", () => {
	it("does not expose duplicate active command names across extensions and markdown commands", () => {
		const entries = [...extensionCommandEntries(), ...markdownCommandEntries()];

		expect(entries.length).toBeGreaterThan(70);
		expect(duplicateNames(entries)).toEqual({});
	});

	it("keeps Claude commands canonical", () => {
		const entries = [...extensionCommandEntries(), ...markdownCommandEntries()];
		const names = entries.map((entry) => entry.name).sort();

		expect(names).toContain("claude-mode");
		expect(names).not.toContain("claude");
		expect(names).not.toContain("claudemode");
		expect(names).not.toContain("qwen");
		expect(names).not.toContain("gemma");
	});

	it("keeps consolidated command families behind canonical names", () => {
		const entries = [...extensionCommandEntries(), ...markdownCommandEntries()];
		const names = entries.map((entry) => entry.name).sort();

		expect(names).toEqual(expect.arrayContaining(["pipeline", "agents", "openrouter", "sub"]));
		for (const retired of [
			"pipeline-status",
			"pipeline-reset",
			"pipeline-off",
			"pipeline-clear",
			"agents-team",
			"agents-list",
			"agents-grid",
			"agents-clear",
			"openrouter-sync",
			"openrouter-enrich",
			"openrouter-preview",
			"openrouter-balance",
			"openrouter-status",
			"subcont",
			"subrm",
			"subclear",
		]) {
			expect(names).not.toContain(retired);
		}
	});
});
