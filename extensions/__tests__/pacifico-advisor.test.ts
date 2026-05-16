// ABOUTME: Tests Pacifico advisor context packing and result formatting.
// ABOUTME: Pacifico has no filesystem access, so all review context must be explicit.

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildAdvisorPrompt } from "../lib/claude/claude-advice-format.ts";
import {
	buildPacificoAdvisorPrompt,
	collectPacificoAdvisorContext,
	formatPacificoAdvisorResult,
	normalizeAdvisorResponse,
} from "../lib/pacifico-advisor.ts";

let cwd: string;

beforeEach(() => {
	cwd = mkdtempSync(join(tmpdir(), "pacifico-advisor-"));
	mkdirSync(join(cwd, ".context"), { recursive: true });
	writeFileSync(join(cwd, "CLAUDE.md"), "Project rules here\n");
	writeFileSync(join(cwd, ".context", "todo.md"), "# Plan: Test Plan\n");
	writeFileSync(join(cwd, "task.add.ts"), "export function addTask() { return 'free-form'; }\n");
});

describe("pacifico advisor context packet", () => {
	it("states Pacifico has no filesystem access and embeds requested files", () => {
		const prompt = buildPacificoAdvisorPrompt({
			question: "What validation boundaries should we use?",
			task_context: "CLI allows free-form task creation.",
			files: ["task.add.ts"],
			agent_role: "planner",
		}, { cwd });

		expect(prompt).toContain("Pacifico has no access to the local filesystem");
		expect(prompt).toContain("Reason only from the context included in this prompt");
		expect(prompt).toContain("## File: task.add.ts");
		expect(prompt).toContain("export function addTask");
		expect(prompt).toContain("Summary:");
		expect(prompt).toContain("Recommended decision:");
		expect(prompt).toContain("Risks:");
		expect(prompt).toContain("Alternatives:");
		expect(prompt).toContain("Next actions:");
		expect(prompt).toContain("Optional presentation extension");
		for (const line of buildAdvisorPrompt("What validation boundaries should we use?", "planner").split("\n").filter(Boolean)) {
			expect(prompt).toContain(line);
		}
	});

	it("includes caller-selected complexity as deterministic response-budget context", () => {
		const prompt = buildPacificoAdvisorPrompt({
			question: "Review this plan.",
			complexity: "complex",
			max_output_tokens: 100_000,
		}, { cwd });

		expect(prompt).toContain("Caller-selected complexity: complex");
		expect(prompt).toContain("Caller-selected max output tokens: 100000");
	});

	it("records explicit diagnostics for missing and truncated context", () => {
		writeFileSync(join(cwd, "large.ts"), "x".repeat(2000));
		const packet = collectPacificoAdvisorContext({
			question: "Review context.",
			files: ["missing.ts", "large.ts"],
			max_file_bytes: 1000,
			max_context_bytes: 20_000,
		}, { cwd });

		expect(packet.diagnostics.some((d) => d.path === "missing.ts" && d.status === "missing")).toBe(true);
		expect(packet.diagnostics.some((d) => d.path === "large.ts" && d.status === "truncated")).toBe(true);
		expect(packet.prompt).toContain("[TRUNCATED to 1000 bytes]");
	});

	it("formats normalized advice in claude_advisor-compatible sections", () => {
		const normalized = normalizeAdvisorResponse(`Summary: Use schemas\nRecommended decision: Validate at CLI and API\nRisks:\n- Drift\nAlternatives:\n- Prompt only\nNext actions:\n- Add tests`);
		const text = formatPacificoAdvisorResult(normalized, { jobId: "job_123", model: "claude-opus-4-6", diagnostics: [{ path: "task.add.ts", status: "included" }] });

		expect(text).toContain("Context supplied: 1/1 context item(s) included");
		expect(text).toContain("Pacifico job: job_123");
		expect(text).toContain("Summary:");
		expect(text).toContain("Recommended decision:");
		expect(text).toContain("Risks:\n- Drift");
		expect(text).toContain("Next actions:\n- Add tests");
	});
});
