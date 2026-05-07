import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const extRoot = join(repoRoot, "extensions");

function file(path: string): string {
	return readFileSync(join(repoRoot, path), "utf-8");
}

describe("advisor strategy wiring", () => {
	it("subagent spawn loads claude-advisor extension", () => {
		const content = readFileSync(join(extRoot, "subagent-widget.ts"), "utf-8");
		expect(content).toContain("claude-advisor.ts");
	});

	it("agent prompts include Advisor escalation guidance", () => {
		const agents = [
			"agents/team/scout.md",
			"agents/builders/builder.md",
			"agents/team/reviewer.md",
			"agents/team/planner.md",
			"agents/tester/tester.md",
			"agents/team/red-team.md",
		];
		for (const p of agents) {
			const content = file(p);
			expect(content).toContain("Advisor (Escalation)");
		}
	});

	it("advisor tool accepts agent_role parameter", () => {
		const content = readFileSync(join(extRoot, "claude-advisor.ts"), "utf-8");
		expect(content).toContain("agent_role");
	});
});
