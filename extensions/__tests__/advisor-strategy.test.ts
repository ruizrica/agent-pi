import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

function file(path: string): string {
	return readFileSync(join(process.cwd(), path), "utf-8");
}

describe("advisor strategy wiring", () => {
	it("subagent spawn loads claude-advisor extension", () => {
		const content = file("extensions/subagent-widget.ts");
		expect(content).toContain("claude-advisor.ts");
	});

	it("agent prompts include Advisor escalation guidance", () => {
		const agents = [
			"agents/scout.md",
			"agents/builder.md",
			"agents/reviewer.md",
			"agents/planner.md",
			"agents/tester.md",
			"agents/red-team.md",
		];
		for (const p of agents) {
			const content = file(p);
			expect(content).toContain("Advisor (Escalation)");
		}
	});

	it("advisor tool accepts agent_role parameter", () => {
		const content = file("extensions/claude-advisor.ts");
		expect(content).toContain("agent_role");
	});
});
