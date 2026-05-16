// ABOUTME: Smoke tests for the Claude advisor extension module.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import extension from "../claude-advisor.ts";

const extRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function source(rel: string): string {
	return readFileSync(join(extRoot, rel), "utf-8");
}

describe("claude-advisor extension", () => {
	it("exports an extension factory", () => {
		expect(typeof extension).toBe("function");
	});

	it("keeps the claude_advisor tool in the tool extension", () => {
		const content = source("claude-advisor.ts");
		expect(content).toContain('name: "claude_advisor"');
		expect(content).toContain("runAdvisor(args, ctx");
	});

	it("does not register /advisor from the tool extension", () => {
		const content = source("claude-advisor.ts");
		expect(content).not.toContain('pi.registerCommand("advisor"');
	});
});
