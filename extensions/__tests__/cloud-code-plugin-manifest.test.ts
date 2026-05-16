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

describe("Cloud Code plugin packaging", () => {
	it("defines a valid plugin manifest", () => {
		const pluginPath = join(repoRoot, ".claude-plugin", "plugin.json");
		const plugin = JSON.parse(readFileSync(pluginPath, "utf-8"));

		expect(plugin.name).toBe("pi-agent-orchestrator");
		expect(plugin.version).toBeTruthy();
		expect(plugin.description).toContain("Cloud Code");
		expect(Array.isArray(plugin.keywords)).toBe(true);
		expect(plugin.keywords).toContain("orchestration");
	});

	it("defines a marketplace entry that points at the local plugin", () => {
		const marketplacePath = join(repoRoot, ".claude-plugin", "marketplace.json");
		const marketplace = JSON.parse(readFileSync(marketplacePath, "utf-8"));

		expect(marketplace.name).toBe("agent-pi-marketplace");
		expect(Array.isArray(marketplace.plugins)).toBe(true);
		expect(marketplace.plugins[0].name).toBe("pi-agent-orchestrator");
		expect(marketplace.plugins[0].source).toBe("./");
	});

	it("ships a skill whose frontmatter matches its directory", () => {
		const skillPath = join(repoRoot, "skills", "pi-agent-orchestrator", "SKILL.md");
		const raw = readFileSync(skillPath, "utf-8");
		const frontmatter = parseFrontmatter(raw);

		expect(frontmatter.name).toBe("pi-agent-orchestrator");
		expect(frontmatter.description).toBeTruthy();
		expect(frontmatter.compatibility).toContain("Claude Code");
	});
});
