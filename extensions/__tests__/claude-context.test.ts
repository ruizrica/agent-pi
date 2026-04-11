// ABOUTME: Tests shared context packet generation for Claude worker/advisor profiles.

import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { buildClaudeContextPacket } from "../lib/claude-context.ts";

describe("buildClaudeContextPacket", () => {
	it("includes cwd, plan title, and task", () => {
		const cwd = mkdtempSync(join(tmpdir(), "claude-context-"));
		mkdirSync(join(cwd, ".context"), { recursive: true });
		writeFileSync(join(cwd, ".context", "todo.md"), "# Plan: Test Claude Context\n\nBody\n");
		writeFileSync(join(cwd, "README.md"), "hello");

		const packet = buildClaudeContextPacket({
			cwd,
			task: "Summarize the project",
			recentSummary: "Worker is preparing implementation.",
			fileHints: ["README.md", "package.json"],
		});

		expect(packet).toContain("Working directory:");
		expect(packet).toContain("Active plan: Plan: Test Claude Context");
		expect(packet).toContain("Recent summary:");
		expect(packet).toContain("Relevant files: README.md, package.json");
		expect(packet).toContain("## Task");
		expect(packet).toContain("Summarize the project");
	});
});
