// ABOUTME: Tests the public skills registry for discoverability, valid frontmatter, and stale archives.
// ABOUTME: Keeps the categorized skills tree aligned with Pi's recursive SKILL.md discovery rules.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(new URL(import.meta.url).pathname), "..", "..");
const skillsRoot = join(repoRoot, "skills");

interface SkillFile {
	path: string;
	relativePath: string;
}

function parseFrontmatter(raw: string): Record<string, string> {
	const match = raw.match(/^---\n([\s\S]*?)\n---/);
	if (!match) return {};
	const fields: Record<string, string> = {};
	for (const line of match[1].split("\n")) {
		const idx = line.indexOf(":");
		if (idx <= 0) continue;
		fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^['\"]|['\"]$/g, "");
	}
	return fields;
}

function walk(dir: string, files: SkillFile[] = []): SkillFile[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const fullPath = join(dir, entry.name);
		const rel = relative(skillsRoot, fullPath);
		if (entry.isDirectory()) {
			if (rel === "private" || rel.startsWith(`private/`)) continue;
			walk(fullPath, files);
			continue;
		}
		if (entry.isFile() && entry.name === "SKILL.md") {
			files.push({ path: fullPath, relativePath: rel });
		}
	}
	return files;
}

function walkLowercaseSkillFiles(dir: string, files: string[] = []): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const fullPath = join(dir, entry.name);
		const rel = relative(skillsRoot, fullPath);
		if (entry.isDirectory()) {
			if (rel === "private" || rel.startsWith(`private/`)) continue;
			walkLowercaseSkillFiles(fullPath, files);
			continue;
		}
		if (entry.isFile() && entry.name === "skill.md") files.push(rel);
	}
	return files;
}

describe("skills inventory", () => {
	const skillFiles = walk(skillsRoot).sort((a, b) => a.relativePath.localeCompare(b.relativePath));

	it("uses the repository skills folder as the only packaged skills root", () => {
		const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf-8"));
		expect(pkg.pi?.skills).toEqual(["./skills"]);
	});

	it("registers the repository skills folder for local sessions", () => {
		const settings = JSON.parse(readFileSync(join(repoRoot, ".pi", "settings.json"), "utf-8"));
		expect(settings.skills).toContain("../skills");
		expect(settings.enableSkillCommands).toBe(true);
	});

	it("has no stale migrated or retired public skill roots", () => {
		expect(existsSync(join(skillsRoot, ".migrated"))).toBe(false);
		expect(existsSync(join(skillsRoot, ".retired"))).toBe(false);
	});

	it("uses canonical uppercase SKILL.md filenames", () => {
		expect(walkLowercaseSkillFiles(skillsRoot)).toEqual([]);
	});

	it("keeps public skill names valid and unique", () => {
		const names = new Map<string, string>();
		for (const skill of skillFiles) {
			const frontmatter = parseFrontmatter(readFileSync(skill.path, "utf-8"));
			expect(frontmatter.name, `${skill.relativePath} name`).toMatch(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/);
			expect(frontmatter.name.length, `${skill.relativePath} name length`).toBeLessThanOrEqual(64);
			expect(frontmatter.description, `${skill.relativePath} description`).toBeTruthy();
			expect(names.get(frontmatter.name), `${frontmatter.name} duplicate`).toBeUndefined();
			names.set(frontmatter.name, skill.relativePath);
		}
	});

	it("includes the approved categorized skill roots", () => {
		const paths = skillFiles.map((skill) => skill.relativePath);
		expect(paths).toContain("core/pi/SKILL.md");
		expect(paths).toContain("core/cmd/SKILL.md");
		expect(paths).toContain("engineering/build/SKILL.md");
		expect(paths).toContain("automation/agent-browser/SKILL.md");
		expect(paths).toContain("testing/gopher-test-viewer/SKILL.md");
		expect(paths.some((path) => path.startsWith("testing/qa-automation/"))).toBe(true);
	});

	it("does not expose skills the user marked unnecessary", () => {
		const skillDirs = skillFiles.map((skill) => dirname(skill.relativePath));
		expect(skillDirs).not.toContain("pi-agent-orchestrator");
		expect(skillDirs).not.toContain("agent-plan");
		expect(skillDirs).not.toContain("agent-spec");
		expect(skillDirs).not.toContain("reco-qa");
		expect(skillDirs).not.toContain("reco-simulators");
		expect(skillDirs.some((dir) => basename(dir) === "pi-agent-orchestrator")).toBe(false);
		expect(skillDirs.some((dir) => basename(dir) === "agent-plan")).toBe(false);
		expect(skillDirs.some((dir) => basename(dir) === "agent-spec")).toBe(false);
	});
});
