// ABOUTME: Smoke tests for the Claude advisor extension module.

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import extension from "../claude-advisor.ts";

function source(path: string): string {
	return readFileSync(join(process.cwd(), path), "utf-8");
}

describe("claude-advisor extension", () => {
	it("exports an extension factory", () => {
		expect(typeof extension).toBe("function");
	});

	it("keeps the claude_advisor tool in the tool extension", () => {
		const content = source("extensions/claude-advisor.ts");
		expect(content).toContain('name: "claude_advisor"');
		expect(content).toContain("runAdvisor(args, ctx");
	});

	it("does not register /advisor from the tool extension", () => {
		const content = source("extensions/claude-advisor.ts");
		expect(content).not.toContain('pi.registerCommand("advisor"');
	});
});
