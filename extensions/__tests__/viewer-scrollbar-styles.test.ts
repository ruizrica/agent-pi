import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { VIEWER_SCROLLBAR_STYLES } from "../lib/viewer-scrollbar-styles.ts";
import { generatePlanViewerHTML } from "../lib/plan-viewer-html.ts";
import { generateSpecViewerHTML } from "../lib/spec-viewer-html.ts";
import { generateCompletionReportHTML, type ReportData } from "../lib/completion-report-html.ts";

function readExtensionFile(relativePath: string): string {
	return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function makeReport(): ReportData {
	return {
		title: "Completion Report",
		summary: "Scrollbar verification",
		files: [],
		baseRef: "HEAD",
		totalAdditions: 0,
		totalDeletions: 0,
	};
}

describe("shared viewer scrollbar styles", () => {
	it("uses the page background for scrollbar tracks in WebKit and Firefox", () => {
		expect(VIEWER_SCROLLBAR_STYLES).toContain("scrollbar-color: var(--scrollbar-thumb, var(--border)) var(--bg);");
		expect(VIEWER_SCROLLBAR_STYLES).toContain("::-webkit-scrollbar-track");
		expect(VIEWER_SCROLLBAR_STYLES).toContain("background: var(--bg);");
		expect(VIEWER_SCROLLBAR_STYLES).toContain("::-webkit-scrollbar-corner");
	});

	it("keeps scrollbar thumbs themed without hard-coding page colors", () => {
		expect(VIEWER_SCROLLBAR_STYLES).toContain("--scrollbar-thumb: var(--border);");
		expect(VIEWER_SCROLLBAR_STYLES).toContain("--scrollbar-thumb-hover: var(--text-dim);");
		expect(VIEWER_SCROLLBAR_STYLES).toContain("border: 2px solid var(--bg);");
	});

	it("renders the shared scrollbar CSS in representative generated report/viewer HTML", () => {
		const projectContext = { projectName: "agent-pi", workingDirectoryName: "agent-pi", fullPath: "/Users/ricardo/Workshop/GitHub/agent-pi", uuid: "123e4567-e89b-12d3-a456-426614174000", revision: 2, timestamp: "4:05pm @ 05/02/2026" };
		const markdownWithContext = "# Plan\n\n---\n\n## Context\n\nBody";
		const planHtml = generatePlanViewerHTML({ markdown: markdownWithContext, title: "Plan", mode: "plan", port: 3000, projectContext });
		const specHtml = generateSpecViewerHTML({ title: "Spec", documents: [{ key: "requirements", label: "Requirements", markdown: markdownWithContext, filePath: "requirements.md" }], port: 3000, projectContext });
		const reportHtml = generateCompletionReportHTML({ report: makeReport(), port: 3000 });

		for (const html of [planHtml, specHtml, reportHtml]) {
			expect(html).toContain("::-webkit-scrollbar-track");
			expect(html).toContain("background: var(--bg);");
			expect(html).toContain("scrollbar-color: var(--scrollbar-thumb, var(--border)) var(--bg);");
		}
		expect(planHtml).toContain("project-context-inline");
		expect(planHtml).toContain("<strong>Project:</strong>");
		expect(planHtml).toContain("<strong>Path:</strong>");
		expect(planHtml).toContain("<strong>UUID:</strong>");
		expect(planHtml).toContain("<strong>Revision:</strong>");
		expect(planHtml).toContain("projectContext.timestamp");
		expect(planHtml).not.toContain("<strong>Directory:</strong>");
		expect(specHtml).toContain("const projectContext = ");
		expect(specHtml).toContain("typeof projectContext !== 'undefined' && projectContext");
		expect(specHtml).toContain("project-context-inline");
		expect(specHtml).toContain("<strong>Project:</strong>");
		expect(specHtml).toContain("<strong>UUID:</strong>");
		expect(specHtml).toContain("projectContext.timestamp");
		expect(specHtml).not.toContain("<strong>Directory:</strong>");
	});

	it("injects the shared CSS into all targeted public and private viewer templates", () => {
		const expectedSources: Array<[string, string]> = [
			["lib/plan-viewer-html.ts", "./viewer-scrollbar-styles.ts"],
			["lib/spec-viewer-html.ts", "./viewer-scrollbar-styles.ts"],
			["lib/completion-report-html.ts", "./viewer-scrollbar-styles.ts"],
			["lib/reports-viewer-html.ts", "./viewer-scrollbar-styles.ts"],
			["lib/research-viewer-html.ts", "./viewer-scrollbar-styles.ts"],
			["lib/security-report-html.ts", "./viewer-scrollbar-styles.ts"],
			["lib/test-viewer-html.ts", "./viewer-scrollbar-styles.ts"],
			["private/extensions/lib/qa-rico-html.ts", "../../../lib/viewer-scrollbar-styles.ts"],
			["private/extensions/lib/swagbucks-viewer-html.ts", "../../../lib/viewer-scrollbar-styles.ts"],
			["private/lib/pr-review-report-html.ts", "../../lib/viewer-scrollbar-styles.ts"],
			["private/lib/pr-review-viewer-html.ts", "../../lib/viewer-scrollbar-styles.ts"],
		];

		for (const [relativePath, importPath] of expectedSources) {
			const source = readExtensionFile(relativePath);
			expect(source).toContain(importPath);
			expect(source).toContain("${VIEWER_SCROLLBAR_STYLES}");
		}

		const swagbucksSource = readExtensionFile("private/extensions/lib/swagbucks-viewer-html.ts");
		expect(swagbucksSource.match(/\$\{VIEWER_SCROLLBAR_STYLES\}/g)?.length).toBe(2);
	});
});
