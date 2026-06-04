// ABOUTME: Regression tests for QA Reco setup/report HTML generation.
// ABOUTME: Guards public pre-release catalog rendering and runtime JSON resilience.
import { describe, expect, it } from "vitest";
import { generateQARecoReportHTML, generateQARecoSetupHTML, type QAReportData } from "../lib/viewers/qa-reco-html.ts";

// Fully-valid report; tests mutate it to model the runtime contract violations
// that come from LLM-assembled JSON passed to show_qa_reco.
function makeReport(): QAReportData {
	return {
		title: "QA Report",
		generatedAt: "2026-06-01T12:00:00Z",
		config: {
			runUnit: true,
			runE2E: false,
			e2eSuites: [],
			platform: "ios",
			captureScreenshots: true,
			generateCoverage: false,
		},
		suites: [],
		totalPassed: 1,
		totalFailed: 0,
		totalSkipped: 0,
		totalDuration: 1234,
		screenshots: [
			{ filename: "home-screen.png", label: "Home screen", suite: "default" },
		],
	};
}

describe("generateQARecoSetupHTML", () => {
	it("renders only the public pre-release automation sections in setup", () => {
		const html = generateQARecoSetupHTML({ port: 0, title: "QA Reco" });

		expect(html).toContain("Basic Feed");
		expect(html).toContain("Scrolling");
		expect(html).toContain("Liking");
		expect(html).toContain("Commenting");
		expect(html).toContain("Critical Sections");
		expect(html).toContain("nested automation checks");

		expect(html).not.toContain("Wallet");
		expect(html).not.toContain("Profile");
		expect(html).not.toContain("Auth");
		expect(html).not.toContain("Search");
		expect(html).not.toContain("Smoke Test");
	});
});

describe("generateQARecoReportHTML", () => {
	it("renders the screenshot gallery when a screenshot label is missing (no crash)", () => {
		const report = makeReport();
		// LLM JSON satisfied the compiler but omitted `label` at runtime.
		delete (report.screenshots[0] as { label?: string }).label;

		let html = "";
		expect(() => {
			html = generateQARecoReportHTML({ report, port: 0 });
		}).not.toThrow();
		// Proves the All Screenshots gallery actually rendered the entry.
		expect(html).toContain("home-screen.png");
	});

	it("renders critical feature sections, P1/risk labels, and nested automation checks", () => {
		const report = makeReport();
		report.releaseGate = { status: "blocked", reason: "Commenting has a backend blocker" };
		report.sections = [
			{
				id: "basic-feed",
				name: "Basic Feed",
				priority: "P1",
				risk: "low",
				status: "passed",
				summary: "Feed loaded with visible card evidence.",
				checks: [
					{ id: "basic-feed.app-foreground", name: "App foreground", status: "passed", evidence: [{ label: "State", value: "foreground" }] },
				],
			},
			{
				id: "commenting",
				name: "Commenting",
				priority: "P1",
				risk: "medium",
				status: "blocked",
				summary: "Backend auth blocked submit.",
				checks: [
					{ id: "commenting.empty-send-disabled", name: "Empty send disabled", status: "passed" },
					{ id: "commenting.submit", name: "Submit", status: "blocked", message: "Missing test account auth" },
				],
			},
		];

		const html = generateQARecoReportHTML({ report, port: 0 });

		expect(html).toContain("Critical Features");
		expect(html).toContain("RELEASE BLOCKED");
		expect(html).toContain("Basic Feed");
		expect(html).toContain("P1 · low risk");
		expect(html).toContain("Commenting");
		expect(html).toContain("P1 · medium risk");
		expect(html).toContain("basic-feed.app-foreground");
		expect(html).toContain("commenting.empty-send-disabled");
		expect(html).toContain("Missing test account auth");
	});

	it("keeps old suite-only reports valid when sections are omitted", () => {
		const report = makeReport();
		report.suites = [
			{ name: "Legacy smoke", type: "e2e", platform: "ios", passed: 1, failed: 0, skipped: 0, duration: 1000, tests: [{ name: "opens", suite: "Legacy smoke", status: "passed" }] },
		];

		const html = generateQARecoReportHTML({ report, port: 0 });

		expect(html).toContain("Legacy smoke");
		expect(html).toContain("ALL PASSED");
		expect(html).not.toContain("<div class=\"critical-heading\" id=\"critical-features\">");
	});
});
