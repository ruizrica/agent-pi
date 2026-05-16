// ABOUTME: Unit tests for snapshot schemas and builders.
// Tests schema validation, round-trip serialization, builder functions, and error handling.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	SNAPSHOT_SCHEMA_VERSION,
	buildPlanSnapshot,
	buildQuestionsSnapshot,
	buildSpecSnapshot,
	buildCompletionSnapshot,
	validateSnapshot,
	synthesizePlanSnapshotFromSource,
	synthesizeQuestionsSnapshotFromSource,
	synthesizeSpecSnapshotFromSource,
	synthesizeCompletionSnapshotFromSource,
	synthesizeSnapshotFromEntry,
	type PlanSnapshot,
	type QuestionsSnapshot,
	type SpecSnapshot,
	type CompletionSnapshot,
} from "../../extensions/lib/viewer-snapshots.js";

describe("viewer-snapshots", () => {
	describe("PlanSnapshot", () => {
		it("validates a valid PlanSnapshot with all required fields", () => {
			const snapshot = buildPlanSnapshot({
				title: "Weekly Plan",
				summary: "Plan for this week's work",
				sourcePath: "/path/to/plan.md",
				markdownContent: "# Plan\n\nDo stuff",
				parsedTasks: [
					{
						id: "1",
						level: 0,
						text: "Task 1",
						checked: false,
						children: [],
					},
				],
			});

			const result = validateSnapshot(snapshot);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.snapshot.mode).toBe("plan");
				expect(result.snapshot.schemaVersion).toBe(1);
			}
		});

		it("rejects a PlanSnapshot missing markdownContent", () => {
			const invalid = {
				schemaVersion: 1,
				capturedAt: new Date().toISOString(),
				mode: "plan",
				title: "Weekly Plan",
				summary: "Plan for this week's work",
				sourcePath: "/path/to/plan.md",
				parsedTasks: [],
				// markdownContent is missing
			};

			const result = validateSnapshot(invalid);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toContain("validation failed");
			}
		});

		it("includes schemaVersion 1 and mode 'plan' when built", () => {
			const snapshot = buildPlanSnapshot({
				title: "Test Plan",
				summary: "Test",
				sourcePath: "/test.md",
				markdownContent: "Test",
				parsedTasks: [],
			});

			expect(snapshot.schemaVersion).toBe(1);
			expect(snapshot.mode).toBe("plan");
		});

		it("sets capturedAt to a valid ISO 8601 string", () => {
			const snapshot = buildPlanSnapshot({
				title: "Test Plan",
				summary: "Test",
				sourcePath: "/test.md",
				markdownContent: "Test",
				parsedTasks: [],
			});

			const date = new Date(snapshot.capturedAt);
			expect(date.getTime()).toBeGreaterThan(0);
			expect(snapshot.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
		});

		it("includes optional actionResult when provided", () => {
			const snapshot = buildPlanSnapshot({
				title: "Test Plan",
				summary: "Test",
				sourcePath: "/test.md",
				markdownContent: "Test",
				parsedTasks: [],
				actionResult: {
					action: "approved",
					note: "Looks good",
				},
			});

			expect(snapshot.actionResult).toBeDefined();
			expect(snapshot.actionResult?.action).toBe("approved");
		});
	});

	describe("QuestionsSnapshot", () => {
		it("validates a valid QuestionsSnapshot", () => {
			const snapshot = buildQuestionsSnapshot({
				title: "Questions",
				summary: "Answer these",
				sourcePath: "/questions.md",
				markdownContent: "# Questions\n\nQ1: What?",
				questionsHtml: "<div>Questions rendered</div>",
			});

			const result = validateSnapshot(snapshot);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.snapshot.mode).toBe("questions");
			}
		});

		it("distinguishes Plan from Questions via the mode field", () => {
			const planSnapshot = buildPlanSnapshot({
				title: "Plan",
				summary: "Plan",
				sourcePath: "/plan.md",
				markdownContent: "Plan",
				parsedTasks: [],
			});

			const questionsSnapshot = buildQuestionsSnapshot({
				title: "Questions",
				summary: "Questions",
				sourcePath: "/questions.md",
				markdownContent: "Questions",
				questionsHtml: "<div></div>",
			});

			expect(planSnapshot.mode).toBe("plan");
			expect(questionsSnapshot.mode).toBe("questions");
		});

		it("requires questionsHtml field", () => {
			const invalid = {
				schemaVersion: 1,
				capturedAt: new Date().toISOString(),
				mode: "questions",
				title: "Questions",
				summary: "Questions",
				sourcePath: "/questions.md",
				markdownContent: "Questions",
				// questionsHtml is missing
			};

			const result = validateSnapshot(invalid);
			expect(result.ok).toBe(false);
		});
	});

	describe("SpecSnapshot", () => {
		it("validates a valid SpecSnapshot with documents, comments, and visuals", () => {
			const snapshot = buildSpecSnapshot({
				title: "Spec Review",
				summary: "Reviewed 2 documents",
				folderPath: "/path/to/spec",
				documents: [
					{
						kind: "requirements",
						path: "requirements.md",
						markdown: "# Requirements",
						status: "approved",
					},
					{
						kind: "design",
						path: "design.md",
						markdown: "# Design",
						status: "draft",
					},
				],
				comments: [
					{
						id: "comment-1",
						section: "overview",
						body: "Looks good",
						author: "reviewer",
						createdAt: new Date().toISOString(),
					},
				],
				visuals: [
					{
						fileName: "diagram.png",
						relativePath: "visuals/diagram.png",
						mimeType: "image/png",
					},
				],
			});

			const result = validateSnapshot(snapshot);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.snapshot.documents).toHaveLength(2);
				expect(result.snapshot.comments).toHaveLength(1);
				expect(result.snapshot.visuals).toHaveLength(1);
			}
		});

		it("round-trips JSON serialization preserving shape", () => {
			const snapshot = buildSpecSnapshot({
				title: "Spec",
				summary: "Spec review",
				folderPath: "/spec",
				documents: [
					{
						kind: "requirements",
						path: "req.md",
						markdown: "# Requirements",
					},
				],
				comments: [
					{
						id: "c1",
						section: "sec1",
						body: "Comment",
						author: "me",
						createdAt: new Date().toISOString(),
					},
				],
				visuals: [
					{
						fileName: "img.png",
						relativePath: "visuals/img.png",
					},
				],
			});

			const serialized = JSON.stringify(snapshot);
			const deserialized = JSON.parse(serialized);

			const result = validateSnapshot(deserialized);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.snapshot.documents).toEqual(snapshot.documents);
				expect(result.snapshot.comments).toEqual(snapshot.comments);
				expect(result.snapshot.visuals).toEqual(snapshot.visuals);
			}
		});
	});

	describe("CompletionSnapshot", () => {
		it("validates a valid CompletionSnapshot with gitDiffs and multiple hunks", () => {
			const snapshot = buildCompletionSnapshot({
				title: "Completed Changes",
				summaryMarkdown: "# Summary\n\nFixed bugs",
				baseRef: "main",
				baseRefResolved: "abc123def456",
				gitDiffs: [
					{
						path: "src/app.ts",
						mode: "modified",
						hunks: [
							{
								oldStart: 10,
								oldLines: 3,
								newStart: 10,
								newLines: 5,
								lines: [
									{ type: "context", content: "export class App {" },
									{ type: "del", content: "  old method" },
									{ type: "add", content: "  new method 1" },
									{ type: "add", content: "  new method 2" },
									{ type: "context", content: "}" },
								],
							},
							{
								oldStart: 30,
								oldLines: 2,
								newStart: 32,
								newLines: 1,
								lines: [
									{ type: "context", content: "  constructor() {" },
									{ type: "del", content: "    this.init();" },
									{ type: "context", content: "  }" },
								],
							},
						],
					},
				],
				filesChanged: 1,
			});

			const result = validateSnapshot(snapshot);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.snapshot.gitDiffs).toHaveLength(1);
				expect(result.snapshot.gitDiffs[0].hunks).toHaveLength(2);
			}
		});

		it("round-trips gitDiffs preserving all line types and content", () => {
			const snapshot = buildCompletionSnapshot({
				title: "Changes",
				summaryMarkdown: "Summary",
				baseRef: "main",
				baseRefResolved: "abc123",
				gitDiffs: [
					{
						path: "file.ts",
						mode: "modified",
						hunks: [
							{
								oldStart: 1,
								oldLines: 2,
								newStart: 1,
								newLines: 3,
								lines: [
									{ type: "context", content: "line 1" },
									{ type: "del", content: "old line" },
									{ type: "add", content: "new line 1" },
									{ type: "add", content: "new line 2" },
									{ type: "context", content: "line 3" },
								],
							},
						],
					},
				],
				filesChanged: 1,
			});

			const serialized = JSON.stringify(snapshot);
			const deserialized = JSON.parse(serialized);

			const result = validateSnapshot(deserialized);
			expect(result.ok).toBe(true);
			if (result.ok) {
				const diff = result.snapshot.gitDiffs[0];
				expect(diff.hunks[0].lines).toEqual([
					{ type: "context", content: "line 1" },
					{ type: "del", content: "old line" },
					{ type: "add", content: "new line 1" },
					{ type: "add", content: "new line 2" },
					{ type: "context", content: "line 3" },
				]);
			}
		});

		it("accepts baseRefResolved as a string, null, or undefined", () => {
			const withString = buildCompletionSnapshot({
				title: "Test",
				summaryMarkdown: "Test",
				baseRef: "main",
				baseRefResolved: "abc123",
				gitDiffs: [],
				filesChanged: 0,
			});

			const withNull = buildCompletionSnapshot({
				title: "Test",
				summaryMarkdown: "Test",
				baseRef: "main",
				baseRefResolved: null,
				gitDiffs: [],
				filesChanged: 0,
			});

			const withUndefined = buildCompletionSnapshot({
				title: "Test",
				summaryMarkdown: "Test",
				baseRef: "main",
				gitDiffs: [],
				filesChanged: 0,
			});

			expect(validateSnapshot(withString).ok).toBe(true);
			expect(validateSnapshot(withNull).ok).toBe(true);
			expect(validateSnapshot(withUndefined).ok).toBe(true);
		});
	});

	describe("validateSnapshot", () => {
		it("rejects schemaVersion !== 1 with clear error message", () => {
			const invalid = {
				schemaVersion: 99,
				capturedAt: new Date().toISOString(),
				mode: "plan",
				title: "Test",
				summary: "Test",
				sourcePath: "/test.md",
				markdownContent: "Test",
				parsedTasks: [],
			};

			const result = validateSnapshot(invalid);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toBe("Unsupported snapshot schemaVersion: 99");
			}
		});

		it("returns { ok: true, snapshot } for valid input", () => {
			const snapshot = buildPlanSnapshot({
				title: "Test",
				summary: "Test",
				sourcePath: "/test.md",
				markdownContent: "Test",
				parsedTasks: [],
			});

			const result = validateSnapshot(snapshot);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.snapshot).toEqual(snapshot);
			}
		});

		it("returns { ok: false, error } with descriptive message for invalid input", () => {
			const result = validateSnapshot({ foo: "bar" });
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toContain("validation failed");
			}
		});

		it("rejects non-object payloads", () => {
			const result = validateSnapshot("not an object");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toContain("must be an object");
			}
		});

		it("rejects null payload", () => {
			const result = validateSnapshot(null);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toContain("must be an object");
			}
		});
	});

	describe("Snapshot builders", () => {
		it("buildPlanSnapshot includes all required fields", () => {
			const snapshot = buildPlanSnapshot({
				title: "Plan",
				summary: "Summary",
				sourcePath: "/path",
				markdownContent: "Content",
				parsedTasks: [],
			});

			expect(snapshot.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
			expect(snapshot.capturedAt).toBeDefined();
			expect(snapshot.mode).toBe("plan");
			expect(snapshot.title).toBe("Plan");
			expect(snapshot.summary).toBe("Summary");
			expect(snapshot.sourcePath).toBe("/path");
			expect(snapshot.markdownContent).toBe("Content");
			expect(snapshot.parsedTasks).toEqual([]);
		});

		it("buildQuestionsSnapshot includes all required fields", () => {
			const snapshot = buildQuestionsSnapshot({
				title: "Questions",
				summary: "Summary",
				sourcePath: "/path",
				markdownContent: "Content",
				questionsHtml: "<div>Q</div>",
			});

			expect(snapshot.mode).toBe("questions");
			expect(snapshot.questionsHtml).toBe("<div>Q</div>");
		});

		it("buildSpecSnapshot includes all required fields", () => {
			const snapshot = buildSpecSnapshot({
				title: "Spec",
				summary: "Summary",
				folderPath: "/spec",
				documents: [],
				comments: [],
				visuals: [],
			});

			expect(snapshot.title).toBe("Spec");
			expect(snapshot.documents).toEqual([]);
			expect(snapshot.comments).toEqual([]);
			expect(snapshot.visuals).toEqual([]);
		});

		it("buildCompletionSnapshot includes all required fields", () => {
			const snapshot = buildCompletionSnapshot({
				title: "Completion",
				summaryMarkdown: "Summary",
				baseRef: "main",
				gitDiffs: [],
				filesChanged: 0,
			});

			expect(snapshot.title).toBe("Completion");
			expect(snapshot.baseRef).toBe("main");
			expect(snapshot.gitDiffs).toEqual([]);
			expect(snapshot.filesChanged).toBe(0);
		});
	});

	describe("Nested task structure", () => {
		it("validates recursive task trees in PlanSnapshot", () => {
			const snapshot = buildPlanSnapshot({
				title: "Complex Plan",
				summary: "Multi-level tasks",
				sourcePath: "/plan.md",
				markdownContent: "# Plan",
				parsedTasks: [
					{
						id: "1",
						level: 0,
						text: "Task 1",
						checked: false,
						children: [
							{
								id: "1.1",
								level: 1,
								text: "Subtask 1.1",
								checked: false,
								children: [
									{
										id: "1.1.1",
										level: 2,
										text: "Sub-subtask 1.1.1",
										checked: true,
										children: [],
									},
								],
							},
						],
					},
				],
			});

			const result = validateSnapshot(snapshot);
			expect(result.ok).toBe(true);
			if (result.ok) {
				const task = result.snapshot.parsedTasks[0];
				expect(task.children).toHaveLength(1);
				expect(task.children![0].children).toHaveLength(1);
				expect(task.children![0].children![0].checked).toBe(true);
			}
		});
	});
});

describe("synthesizers", () => {
	describe("synthesizePlanSnapshotFromSource", () => {
		let tmpDir: string;

		beforeEach(() => {
			tmpDir = join(tmpdir(), `plan-test-${Date.now()}`);
			mkdirSync(tmpDir, { recursive: true });
		});

		afterEach(() => {
			try {
				rmSync(tmpDir, { recursive: true, force: true });
			} catch {
				// Ignore cleanup errors
			}
		});

		it("returns null when sourcePath does not exist", () => {
			const result = synthesizePlanSnapshotFromSource({
				id: "test-1",
				title: "Test Plan",
				sourcePath: "/nonexistent/path.md",
			});
			expect(result).toBeNull();
		});

		it("returns valid PlanSnapshot when reading a tmp markdown file", () => {
			const sourcePath = join(tmpDir, "plan.md");
			writeFileSync(sourcePath, "# My Plan\nDo stuff", "utf-8");

			const result = synthesizePlanSnapshotFromSource({
				id: "test-1",
				title: "My Plan",
				sourcePath,
			});

			expect(result).not.toBeNull();
			if (result) {
				const validation = validateSnapshot(result);
				expect(validation.ok).toBe(true);
				expect(result.mode).toBe("plan");
				expect(result.title).toBe("My Plan");
				expect(result.summary).toBe("My Plan");
				expect(result.markdownContent).toContain("Do stuff");
			}
		});
	});

	describe("synthesizeQuestionsSnapshotFromSource", () => {
		let tmpDir: string;

		beforeEach(() => {
			tmpDir = join(tmpdir(), `questions-test-${Date.now()}`);
			mkdirSync(tmpDir, { recursive: true });
		});

		afterEach(() => {
			try {
				rmSync(tmpDir, { recursive: true, force: true });
			} catch {
				// Ignore cleanup errors
			}
		});

		it("produces escaped questionsHtml when markdown contains script tags", () => {
			const sourcePath = join(tmpDir, "questions.md");
			const markdown = "# Questions\n<script>alert('xss')</script>\nQ1: What?";
			writeFileSync(sourcePath, markdown, "utf-8");

			const result = synthesizeQuestionsSnapshotFromSource({
				id: "test-1",
				title: "Questions",
				sourcePath,
			});

			expect(result).not.toBeNull();
			if (result) {
				expect(result.questionsHtml).toContain("&lt;script&gt;");
				expect(result.questionsHtml).toContain("&lt;/script&gt;");
				expect(result.questionsHtml).not.toContain("<script>");
				const validation = validateSnapshot(result);
				expect(validation.ok).toBe(true);
			}
		});
	});

	describe("synthesizeSpecSnapshotFromSource", () => {
		let tmpDir: string;

		beforeEach(() => {
			tmpDir = join(tmpdir(), `spec-test-${Date.now()}`);
			mkdirSync(tmpDir, { recursive: true });
		});

		afterEach(() => {
			try {
				rmSync(tmpDir, { recursive: true, force: true });
			} catch {
				// Ignore cleanup errors
			}
		});

		it("reads requirements.md, design.md, tasks.md from a tmp folder", () => {
			writeFileSync(join(tmpDir, "requirements.md"), "# Requirements\nReq 1", "utf-8");
			writeFileSync(join(tmpDir, "design.md"), "# Design\nDesign 1", "utf-8");
			writeFileSync(join(tmpDir, "tasks.md"), "# Tasks\nTask 1", "utf-8");

			const result = synthesizeSpecSnapshotFromSource({
				id: "test-1",
				title: "Spec",
				folderPath: tmpDir,
			});

			expect(result).not.toBeNull();
			if (result) {
				const validation = validateSnapshot(result);
				expect(validation.ok).toBe(true);
				expect(result.documents).toHaveLength(3);
				const kinds = result.documents.map((d) => d.kind).sort();
				expect(kinds).toEqual(["design", "requirements", "tasks"]);
			}
		});

		it("reads spec-comments.json when present", () => {
			writeFileSync(join(tmpDir, "requirements.md"), "# Requirements", "utf-8");
			const comments = [
				{
					id: "comment-1",
					section: "overview",
					body: "Looks good",
					author: "reviewer",
					createdAt: new Date().toISOString(),
				},
			];
			writeFileSync(join(tmpDir, "spec-comments.json"), JSON.stringify(comments), "utf-8");

			const result = synthesizeSpecSnapshotFromSource({
				id: "test-1",
				title: "Spec",
				folderPath: tmpDir,
			});

			expect(result).not.toBeNull();
			if (result) {
				const validation = validateSnapshot(result);
				expect(validation.ok).toBe(true);
				expect(result.comments).toHaveLength(1);
				expect(result.comments[0].body).toBe("Looks good");
			}
		});

		it("returns null for an empty folder", () => {
			const result = synthesizeSpecSnapshotFromSource({
				id: "test-1",
				title: "Spec",
				folderPath: tmpDir,
			});
			expect(result).toBeNull();
		});
	});

	describe("synthesizeCompletionSnapshotFromSource", () => {
		let tmpDir: string;

		beforeEach(() => {
			tmpDir = join(tmpdir(), `completion-test-${Date.now()}`);
			mkdirSync(tmpDir, { recursive: true });
		});

		afterEach(() => {
			try {
				rmSync(tmpDir, { recursive: true, force: true });
			} catch {
				// Ignore cleanup errors
			}
		});

		it("always returns a snapshot (degraded when sourcePath missing)", () => {
			const result = synthesizeCompletionSnapshotFromSource({
				id: "test-1",
				title: "Completed Work",
			});

			expect(result).not.toBeNull();
			const validation = validateSnapshot(result);
			expect(validation.ok).toBe(true);
			expect(result.metadata?.degraded).toBe(true);
			expect(result.metadata?.reason).toBe("no-snapshot-available");
			expect(result.gitDiffs).toEqual([]);
			expect(result.baseRefResolved).toBeNull();
		});

		it("reads sourcePath if available", () => {
			const sourcePath = join(tmpDir, "summary.md");
			writeFileSync(sourcePath, "# Work Summary\nFixed critical bug", "utf-8");

			const result = synthesizeCompletionSnapshotFromSource({
				id: "test-1",
				title: "Completed Work",
				sourcePath,
			});

			expect(result).not.toBeNull();
			expect(result.summaryMarkdown).toContain("Fixed critical bug");
		});
	});

	describe("synthesizeSnapshotFromEntry", () => {
		let tmpDir: string;

		beforeEach(() => {
			tmpDir = join(tmpdir(), `entry-test-${Date.now()}`);
			mkdirSync(tmpDir, { recursive: true });
		});

		afterEach(() => {
			try {
				rmSync(tmpDir, { recursive: true, force: true });
			} catch {
				// Ignore cleanup errors
			}
		});

		it("dispatches correctly by category", () => {
			const planPath = join(tmpDir, "plan.md");
			writeFileSync(planPath, "# Plan", "utf-8");

			const result = synthesizeSnapshotFromEntry({
				id: "entry-1",
				category: "plan",
				title: "My Plan",
				sourcePath: planPath,
			});

			expect(result).not.toBeNull();
			if (result) {
				expect(result.mode).toBe("plan");
				const validation = validateSnapshot(result);
				expect(validation.ok).toBe(true);
			}
		});

		it("returns null for unknown categories", () => {
			const result = synthesizeSnapshotFromEntry({
				id: "entry-1",
				category: "unknown_category",
				title: "Something",
			});

			expect(result).toBeNull();
		});

		it("handles questions category", () => {
			const questionsPath = join(tmpDir, "questions.md");
			writeFileSync(questionsPath, "# Questions\n<tag>content</tag>", "utf-8");

			const result = synthesizeSnapshotFromEntry({
				id: "entry-1",
				category: "questions",
				title: "Questions",
				sourcePath: questionsPath,
			});

			expect(result).not.toBeNull();
			if (result && "mode" in result) {
				expect(result.mode).toBe("questions");
			}
		});

		it("handles spec category", () => {
			writeFileSync(join(tmpDir, "requirements.md"), "# Requirements", "utf-8");

			const result = synthesizeSnapshotFromEntry({
				id: "entry-1",
				category: "spec",
				title: "Spec",
				viewerPath: tmpDir,
			});

			expect(result).not.toBeNull();
			if (result && "documents" in result) {
				expect(result.documents.length).toBeGreaterThan(0);
			}
		});

		it("handles completion category", () => {
			const result = synthesizeSnapshotFromEntry({
				id: "entry-1",
				category: "completion",
				title: "Completion",
			});

			expect(result).not.toBeNull();
			if (result && "gitDiffs" in result) {
				expect(result.metadata?.degraded).toBe(true);
			}
		});
	});
});
