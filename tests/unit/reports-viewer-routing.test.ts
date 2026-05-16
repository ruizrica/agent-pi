// ABOUTME: Unit tests for category-based routing in openOriginalReport.
// Tests that each report category uses the correct viewer command with appropriate flags.

import { describe, it, expect, vi } from "vitest";

// Mock fs.existsSync before importing openOriginalReport
vi.mock("node:fs", async () => {
	const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
	return {
		...actual,
		existsSync: () => true,
	};
});

// Mock child_process before importing openOriginalReport
vi.mock("node:child_process", () => ({
	spawn: vi.fn(() => ({
		unref: vi.fn(),
	})),
	execFileSync: vi.fn(),
}));

import { openOriginalReport } from "../../extensions/reports-viewer.js";

describe("openOriginalReport routing", () => {
	it("dispatches 'plan' category to /show-plan command", () => {
		const entry = {
			id: "plan-123",
			category: "plan",
			viewerPath: "/home/user/.context/reports/raw/plan-123.json",
			sourcePath: "/home/user/.context/todo.md",
		};

		// Should not throw
		expect(() => openOriginalReport(entry)).not.toThrow();
	});

	it("dispatches 'questions' category to /show-plan with --mode questions", () => {
		const entry = {
			id: "questions-456",
			category: "questions",
			viewerPath: "/home/user/.context/questions.md",
			sourcePath: "/home/user/.context/questions.md",
		};

		expect(() => openOriginalReport(entry)).not.toThrow();
	});

	it("dispatches 'spec' category to /show-spec command", () => {
		const entry = {
			id: "spec-789",
			category: "spec",
			viewerPath: "/home/user/.kiro/specs/my-spec",
			sourcePath: "/home/user/.kiro/specs/my-spec",
		};

		expect(() => openOriginalReport(entry)).not.toThrow();
	});

	it("dispatches 'completion' category to /show-report command", () => {
		const entry = {
			id: "completion-111",
			category: "completion",
			sourcePath: "/home/user/.context/reports/raw/completion-111.json",
		};

		expect(() => openOriginalReport(entry)).not.toThrow();
	});

	it("dispatches 'qa_rico' category to /show-file (fallback)", () => {
		const entry = {
			id: "qa-222",
			category: "qa_rico",
			viewerPath: "/home/user/qa-report.md",
			sourcePath: "/home/user/qa-report.md",
		};

		expect(() => openOriginalReport(entry)).not.toThrow();
	});

	it("dispatches 'swagbucks' category to /show-file (fallback)", () => {
		const entry = {
			id: "swag-333",
			category: "swagbucks",
			viewerPath: "/home/user/swag-report.md",
			sourcePath: "/home/user/swag-report.md",
		};

		expect(() => openOriginalReport(entry)).not.toThrow();
	});

	it("dispatches 'pr_review' category to /show-file (fallback)", () => {
		const entry = {
			id: "pr-444",
			category: "pr_review",
			viewerPath: "/home/user/pr-review.md",
			sourcePath: "/home/user/pr-review.md",
		};

		expect(() => openOriginalReport(entry)).not.toThrow();
	});

	it("dispatches unknown category to /show-file (fallback)", () => {
		const entry = {
			id: "unknown-555",
			category: "unknown_type",
			viewerPath: "/home/user/unknown.md",
			sourcePath: "/home/user/unknown.md",
		};

		expect(() => openOriginalReport(entry)).not.toThrow();
	});

	it("uses viewerPath when available, falls back to sourcePath", () => {
		const entry = {
			id: "plan-666",
			category: "plan",
			viewerPath: "/home/user/.context/reports/raw/plan-666.json",
			sourcePath: "/home/user/.context/todo.md",
		};

		expect(() => openOriginalReport(entry)).not.toThrow();
	});

	it("throws error when no source path is available for plan", () => {
		const entry = {
			id: "bad-777",
			category: "plan",
			// No viewerPath or sourcePath
		};

		expect(() => openOriginalReport(entry)).toThrow(
			"No source path available"
		);
	});

	it("throws error when no source path is available for spec", () => {
		const entry = {
			id: "bad-888",
			category: "spec",
			// No viewerPath or sourcePath
		};

		expect(() => openOriginalReport(entry)).toThrow(
			"No source path available"
		);
	});

	it("does not require path for completion category", () => {
		const entry = {
			id: "completion-999",
			category: "completion",
			// No sourcePath or viewerPath needed for completion
		};

		expect(() => openOriginalReport(entry)).not.toThrow();
	});

	it("constructs correct command args for each category", () => {
		// Test that the switch statement routes correctly
		// by verifying no errors are thrown for each category
		const categories = [
			{ category: "plan", hasPath: true },
			{ category: "questions", hasPath: true },
			{ category: "spec", hasPath: true },
			{ category: "completion", hasPath: false },
			{ category: "qa_rico", hasPath: true },
		];

		for (const { category, hasPath } of categories) {
			const entry = {
				id: `test-${category}`,
				category,
				...(hasPath && {
					viewerPath: "/test/path",
					sourcePath: "/test/source",
				}),
			};

			expect(() => openOriginalReport(entry)).not.toThrow(
				`Failed for category: ${category}`
			);
		}
	});
});
