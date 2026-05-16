// ABOUTME: Tests that shared advisor runner preserves claude_advisor tool execution behavior.

import { describe, expect, it, vi } from "vitest";

const spawnClaudeCli = vi.fn(async () => ({
	result: [
		"Summary: Use the shared runner.",
		"Recommended decision: Keep existing advisor behavior unchanged.",
		"Risks:",
		"- Regression risk",
		"Alternatives:",
		"- Duplicate code",
		"Next actions:",
		"- Run tests",
	].join("\n"),
}));

vi.mock("../claude-cli.ts", () => ({ spawnClaudeCli }));

const { runAdvisor } = await import("../claude-advisor-runner.ts");

describe("runAdvisor", () => {
	it("uses the existing claude-advisor profile, tools, context, and normalized output", async () => {
		const updates: string[] = [];
		const result = await runAdvisor({
			question: "Should we keep behavior?",
			task_context: "Current task context",
			files: ["extensions/claude-advisor.ts"],
			model: "claude-opus-test",
			agent_role: "builder",
		}, { cwd: process.cwd() }, (streamed) => updates.push(streamed));

		expect(spawnClaudeCli).toHaveBeenCalledOnce();
		const call = spawnClaudeCli.mock.calls[0][0];
		expect(call.profile).toBe("claude-advisor");
		expect(call.cwd).toBe(process.cwd());
		expect(call.model).toBe("claude-opus-test");
		expect(call.tools).toBe("read,grep,find,ls,bash");
		expect(call.systemPrompt).toContain("produce strategic guidance");
		expect(call.task).toContain("Current task context");
		expect(call.task).toContain("You are advising a builder agent");
		expect(call.contextPacket).toContain("extensions/claude-advisor.ts");
		expect(result.text).toContain("Summary: Summary: Use the shared runner.");
		expect(result.normalized.recommendation).toContain("Keep existing advisor behavior unchanged");
		expect(result.normalized.risks).toEqual(["Regression risk"]);
		expect(updates).toEqual([]);
	});
});
