// ABOUTME: Smoke tests for the standalone /advisor command extension.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import extension from "../advisor-command.ts";

const extRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function source(): string {
	return readFileSync(join(extRoot, "advisor-command.ts"), "utf-8");
}

describe("advisor-command extension", () => {
	it("exports an extension factory", () => {
		expect(typeof extension).toBe("function");
	});

	it("registers /advisor for on-demand guidance", () => {
		const content = source();
		expect(content).toContain('pi.registerCommand("advisor"');
		expect(content).toContain("Ask the Claude advisor for on-demand guidance");
	});

	it("preserves current task context behavior", () => {
		const content = source();
		expect(content).toContain("currentTaskContext()");
		expect(content).toContain("__piCurrentTask");
		expect(content).toContain("__piTaskList");
		expect(content).toContain('agent_role: "advisor-command"');
	});

	it("reuses the shared advisor runner instead of duplicating tool logic", () => {
		const content = source();
		expect(content).toContain('import { runAdvisor } from "./lib/claude-advisor-runner.ts"');
		expect(content).toContain("runAdvisor({");
	});
});
