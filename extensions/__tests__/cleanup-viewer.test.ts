// ABOUTME: Verifies cleanup viewer Claude analysis uses the shared local Claude CLI runtime.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source() {
	return readFileSync(join(process.cwd(), "extensions/cleanup-viewer.ts"), "utf-8");
}

describe("cleanup-viewer Claude runtime migration", () => {
	it("uses shared Claude runtime instead of direct Anthropic Agent SDK", () => {
		const content = source();
		expect(content).toContain('import { runClaudeRuntime } from "./lib/claude-runtime.ts"');
		expect(content).toContain('profile: "claude-advisor"');
		expect(content).not.toContain("@anthropic-ai/claude-agent-sdk");
		expect(content).not.toContain("query({");
	});
});
