// ABOUTME: Tests for the /pi skill (Pi runtime) and /pi slash command (Claude Code bridge dispatch).
// ABOUTME: Validates SKILL.md frontmatter, command bridge references, and coverage of all 5 operational modes.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function parseFrontmatter(raw: string): Record<string, string> {
	const match = raw.match(/^---\n([\s\S]*?)\n---/);
	if (!match) return {};
	const fields: Record<string, string> = {};
	for (const line of match[1].split("\n")) {
		const idx = line.indexOf(":");
		if (idx <= 0) continue;
		fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
	}
	return fields;
}

const skillPath = join(repoRoot, "skills", "pi", "SKILL.md");

describe("/pi skill", () => {
	const raw = readFileSync(skillPath, "utf-8");
	const frontmatter = parseFrontmatter(raw);
	const body = raw.replace(/^---\n[\s\S]*?\n---\n*/, "");

	it("has correct frontmatter name", () => {
		expect(frontmatter.name).toBe("pi");
	});

	it("includes set_mode in allowed-tools", () => {
		expect(frontmatter["allowed-tools"]).toContain("set_mode");
	});

	it("references all 5 operational mode subcommands", () => {
		for (const mode of ["plan", "spec", "team", "pipeline", "chain"]) {
			expect(body.toLowerCase()).toContain(mode);
		}
	});

	it("maps each subcommand to the correct set_mode call", () => {
		expect(body).toContain('mode: "PLAN"');
		expect(body).toContain('mode: "SPEC"');
		expect(body).toContain('mode: "TEAM"');
		expect(body).toContain('mode: "CHAIN"');
		expect(body).toContain('mode: "PIPELINE"');
	});

	it("documents prerequisites for modes that need setup", () => {
		expect(body).toContain("/agents-team");
		expect(body).toContain("/chain");
		expect(body).toContain("/pipeline");
	});

	it("includes help for when no subcommand is given", () => {
		expect(body.toLowerCase()).toContain("no subcommand");
	});
});

const commandPath = join(repoRoot, ".claude-plugin", "commands", "pi.md");
const pluginPath = join(repoRoot, ".claude-plugin", "plugin.json");

describe("/pi slash command (Claude Code bridge)", () => {
	it("is registered in plugin.json", () => {
		const plugin = JSON.parse(readFileSync(pluginPath, "utf-8"));
		expect(Array.isArray(plugin.commands)).toBe(true);
		expect(plugin.commands).toContain("./commands/pi.md");
	});

	it("command file exists with valid frontmatter", () => {
		const raw = readFileSync(commandPath, "utf-8");
		const frontmatter = parseFrontmatter(raw);
		expect(frontmatter.description).toContain("Pi");
		expect(frontmatter["argument-hint"]).toBeTruthy();
	});

	it("allowed-tools includes Bash for bridge execution", () => {
		const raw = readFileSync(commandPath, "utf-8");
		expect(raw).toContain("Bash");
	});

	it("command body uses $ARGUMENTS for argument substitution", () => {
		const raw = readFileSync(commandPath, "utf-8");
		expect(raw).toContain("$ARGUMENTS");
	});

	it("command body references the pi-agent-orchestrator bridge", () => {
		const raw = readFileSync(commandPath, "utf-8");
		expect(raw).toContain("pi-agent-orchestrator");
	});

	it("command body references all 5 modes", () => {
		const raw = readFileSync(commandPath, "utf-8");
		const body = raw.replace(/^---\n[\s\S]*?\n---\n*/, "");
		for (const mode of ["plan", "spec", "team", "pipeline", "chain"]) {
			expect(body.toLowerCase()).toContain(mode);
		}
	});

	it("command body references key bridge commands", () => {
		const raw = readFileSync(commandPath, "utf-8");
		expect(raw).toContain("dispatch");
		expect(raw).toContain("batch");
		expect(raw).toContain("chain");
	});
});
