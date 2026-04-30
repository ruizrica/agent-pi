import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { generateCompletionReportHTML, type ReportData } from "../lib/completion-report-html.ts";

function makeReport(summary: string): ReportData {
	return {
		title: "Completion Report",
		summary,
		files: [
			{
				path: "extensions/example.ts",
				status: "modified",
				additions: 3,
				deletions: 1,
				diff: "@@ -1,1 +1,1 @@\n-old\n+new",
			},
		],
		baseRef: "HEAD",
		totalAdditions: 3,
		totalDeletions: 1,
	};
}

describe("completion-report routing", () => {
	const source = readFileSync(new URL("../completion-report.ts", import.meta.url), "utf8");

	it("prefers the native Commander report experience when available", () => {
		expect(source).toContain("Prefer Commander's native report experience when available");
		expect(source).toContain("if (isCommanderAvailable())");
		expect(source).not.toContain("preferCommanderReadOnly");
		expect(source).not.toContain("PI_COMPLETION_REPORT_COMMANDER_READONLY");
	});
});

describe("completion-report rollback controls", () => {
	it("renders per-file and global rollback controls with visible styling", () => {
		const html = generateCompletionReportHTML({
			report: makeReport("Completed work"),
			port: 3000,
		});

		expect(html).toContain('id="rollbackAllBtn"');
		expect(html).toContain('class="rollback-btn');
		expect(html).toContain('rollbackFile(');
		expect(html).toContain('function updateRollbackAllBtn()');
		expect(html).toContain('.file-actions {');
		expect(html).toContain('min-width: 104px;');
		expect(html).toContain('.rollback-btn {');
		expect(html).toContain('min-width: 86px;');
		expect(html).toContain('#rollbackAllBtn {');
		expect(html).toContain('body.done-state .rollback-btn { display: none; }');
	});
});

describe("completion-report Mermaid rendering", () => {
	it("schedules repeated Mermaid rendering attempts for summary and task content", () => {
		const html = generateCompletionReportHTML({
			report: makeReport("## Architecture\n\n```mermaid\ngraph LR\nA-->B\n```"),
			port: 3000,
		});

		expect(html).toContain("scheduleMermaidRender(document.getElementById('summaryContent'))");
		expect(html).toContain("scheduleMermaidRender(document.getElementById('taskContent'))");
		expect(html).toContain("function rerunAllMermaidSections()");
		expect(html).toContain("window.__piCompletionReportMermaid = {");
		expect(html).toContain("function getFallbackBlocks()");
		expect(html).toContain("document.querySelectorAll('#summaryContent pre, #taskContent pre')");
		expect(html).toContain("completion-report-fallback-");
		expect(html).toContain("window.addEventListener('load', function() {");
		expect(html).toContain("setTimeout(tryRender, 300)");
		expect(html).toContain("window.setTimeout(function() {");
	});

	it("detects Mermaid blocks by pre/code class or source shape and provides a fallback state", () => {
		const html = generateCompletionReportHTML({
			report: makeReport("```mermaid\ngraph LR\nA[show_plan] --> B[show_report]\n```"),
			port: 3000,
		});

		expect(html).toContain("function sourceLooksLikeMermaid(source)");
		expect(html).toContain("function getPendingMermaidBlocks(container)");
		expect(html).toContain("container.querySelectorAll('pre')");
		expect(html).toContain("preEl.dataset.mermaidState = 'processing'");
		expect(html).toContain("preEl.parentNode.replaceChild(wrapper, preEl)");
		expect(html).toContain("Mermaid toolbar setup error for diagram");
		expect(html).toContain("showMermaidFallback(preEl, source, err)");
		expect(html).toContain("Mermaid render failed — showing source");
	});
});
