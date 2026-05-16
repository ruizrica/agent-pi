// ABOUTME: Verifies cleanup viewer Claude analysis uses the shared local Claude CLI runtime.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const extRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function source() {
	return readFileSync(join(extRoot, "cleanup-viewer.ts"), "utf-8");
}

describe("cleanup-viewer Claude runtime migration", () => {
	it("uses shared Claude runtime instead of direct Anthropic Agent SDK", () => {
		const content = source();
		expect(content).toContain('import { runClaudeRuntime } from "./lib/claude/claude-runtime.ts"');
		expect(content).toContain('profile: "claude-advisor"');
		expect(content).not.toContain("@anthropic-ai/claude-agent-sdk");
		expect(content).not.toContain("query({");
	});
});
