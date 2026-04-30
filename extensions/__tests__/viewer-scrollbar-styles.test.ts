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
		const planHtml = generatePlanViewerHTML({ markdown: "# Plan", title: "Plan", mode: "plan", port: 3000 });
		const specHtml = generateSpecViewerHTML({ title: "Spec", documents: [], port: 3000 });
		const reportHtml = generateCompletionReportHTML({ report: makeReport(), port: 3000 });

		for (const html of [planHtml, specHtml, reportHtml]) {
			expect(html).toContain("::-webkit-scrollbar-track");
			expect(html).toContain("background: var(--bg);");
			expect(html).toContain("scrollbar-color: var(--scrollbar-thumb, var(--border)) var(--bg);");
		}
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
