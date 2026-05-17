// ABOUTME: Tests for the Pacifico Result Markdown adapter.
// ABOUTME: Pacifico results intentionally reuse the existing Plan Viewer instead of bespoke HTML.

import { describe, expect, it } from "vitest";
import { pacificoResultCardTitle, pacificoResultToMarkdown, type PacificoResultData } from "../lib/pacifico-result-html.ts";

function sample(overrides: Partial<PacificoResultData> = {}): PacificoResultData {
	return {
		title: "Pacifico Result",
		question: "What should we do next?",
		generatedAt: "2026-01-01T00:00:00.000Z",
		advisor: {
			summary: "Use the advisor path",
			recommendation: "Route /pacifico through pacifico_advisor",
			risks: ["Command drift"],
			alternatives: ["Keep both commands"],
			nextActions: ["Add tests"],
			raw: "Summary: Use the advisor path",
		},
		formattedText: "Summary: Use the advisor path\n\nRecommended decision: Route /pacifico through pacifico_advisor",
		metadata: { complexity: "complex", model: "claude-haiku-4-5", provider: "anthropic", route: "queue", jobId: "job_123" },
		diagnostics: [{ path: "CLAUDE.md", status: "included", bytes: 123 }],
		...overrides,
	};
}

describe("Pacifico Result Markdown adapter", () => {
	it("produces plan-viewer-ready Markdown with advisor sections and metadata", () => {
		const markdown = pacificoResultToMarkdown(sample());
		expect(markdown).toContain("# Pacifico Result");
		expect(markdown).toContain("## Task Prompt");
		expect(markdown).toContain("What should we do next?");
		expect(markdown).toContain("## Metadata");
		expect(markdown).toContain("**Complexity:** complex");
		expect(markdown).toContain("**Model:** claude-haiku-4-5");
		expect(markdown).toContain("## Recommended Decision");
		expect(markdown).toContain("Route /pacifico through pacifico_advisor");
		expect(markdown).toContain("## Risks");
		expect(markdown).toContain("- Command drift");
		expect(markdown).toContain("## Context Diagnostics");
		expect(markdown).toContain("**CLAUDE.md** — included");
	});

	it("builds card titles from the actual task prompt instead of advisor boilerplate", () => {
		expect(pacificoResultCardTitle("Fix the Pacifico truncation bug and preserve full context")).toBe("Fix the Pacifico truncation bug and preserve full context");
		expect(pacificoResultCardTitle("Review the shared context and answer as an advisor, not the main executor.\nQuestion: Fix title", 32)).toBe("Fix title");
		expect(pacificoResultCardTitle("   ")).toBe("Pacifico request");
	});

	it("keeps model-supplied HTML as escaped Markdown text", () => {
		const markdown = pacificoResultToMarkdown(sample({
			advisor: {
				summary: "<script>alert(1)</script>",
				recommendation: "<img src=x onerror=alert(1)>",
				risks: ["<b>risk</b>"],
				alternatives: [],
				nextActions: [],
				raw: "<script>alert(1)</script>",
			},
		}));

		expect(markdown).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
		expect(markdown).toContain("&lt;img src=x onerror=alert(1)&gt;");
		expect(markdown).not.toContain("<script>alert(1)</script>");
	});
});
