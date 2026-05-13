import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildSpecSnapshot, validateSnapshot, type SpecSnapshot } from "../../extensions/lib/viewer-snapshots.ts";

describe("spec-viewer-snapshot", () => {
	describe("buildSpecSnapshot", () => {
		it("should build a valid SpecSnapshot with documents, comments, and visuals", () => {
			const snapshot = buildSpecSnapshot({
				title: "Test Feature",
				summary: "A test feature specification",
				folderPath: "/test/specs/feature",
				documents: [
					{
						kind: "requirements",
						path: "requirements.md",
						markdown: "# Requirements\nTest requirements",
					},
					{
						kind: "design",
						path: "design.md",
						markdown: "# Design\nTest design",
					},
				],
				comments: [
					{
						id: "comment-1",
						section: "requirements",
						body: "Good requirements",
						author: "reviewer",
						createdAt: "2026-01-01T00:00:00Z",
					},
					{
						id: "comment-2",
						section: "design",
						body: "Design needs work",
						author: "reviewer",
						createdAt: "2026-01-01T00:01:00Z",
					},
				],
				visuals: [
					{
						fileName: "diagram.png",
						relativePath: "visuals/diagram.png",
						mimeType: "image/png",
					},
				],
				actionResult: {
					action: "changes_requested",
				},
			});

			// Validate the snapshot
			const validation = validateSnapshot(snapshot);
			expect(validation.ok).toBe(true);

			// Verify structure
			expect(snapshot.schemaVersion).toBe(1);
			expect(snapshot.title).toBe("Test Feature");
			expect(snapshot.summary).toBe("A test feature specification");
			expect(snapshot.documents).toHaveLength(2);
			expect(snapshot.comments).toHaveLength(2);
			expect(snapshot.visuals).toHaveLength(1);
			expect(snapshot.actionResult?.action).toBe("changes_requested");
		});

		it("should capture correct schema version", () => {
			const snapshot = buildSpecSnapshot({
				title: "Test",
				summary: "Test",
				folderPath: "/test",
				documents: [],
				comments: [],
				visuals: [],
			});

			expect(snapshot.schemaVersion).toBe(1);
		});

		it("should set capturedAt timestamp", () => {
			const beforeTime = Date.now();
			const snapshot = buildSpecSnapshot({
				title: "Test",
				summary: "Test",
				folderPath: "/test",
				documents: [],
				comments: [],
				visuals: [],
			});
			const afterTime = Date.now();

			const capturedTime = new Date(snapshot.capturedAt).getTime();
			expect(capturedTime).toBeGreaterThanOrEqual(beforeTime);
			expect(capturedTime).toBeLessThanOrEqual(afterTime);
		});
	});

	describe("validateSnapshot", () => {
		it("should validate a correct SpecSnapshot", () => {
			const snapshot = buildSpecSnapshot({
				title: "Test",
				summary: "Test",
				folderPath: "/test",
				documents: [
					{
						kind: "requirements",
						path: "requirements.md",
						markdown: "Test",
					},
				],
				comments: [],
				visuals: [],
			});

			const validation = validateSnapshot(snapshot);
			expect(validation.ok).toBe(true);
			if (validation.ok) {
				expect(validation.snapshot).toEqual(snapshot);
			}
		});

		it("should reject invalid schema version", () => {
			const invalidSnapshot = {
				schemaVersion: 99,
				capturedAt: new Date().toISOString(),
				title: "Test",
				summary: "Test",
				folderPath: "/test",
				documents: [],
				comments: [],
				visuals: [],
			};

			const validation = validateSnapshot(invalidSnapshot);
			expect(validation.ok).toBe(false);
			if (!validation.ok) {
				expect(validation.error).toContain("schemaVersion");
			}
		});

		it("should reject missing required fields", () => {
			const incompleteSnapshot = {
				schemaVersion: 1,
				capturedAt: new Date().toISOString(),
				title: "Test",
				// missing summary, folderPath, documents, comments, visuals
			};

			const validation = validateSnapshot(incompleteSnapshot);
			expect(validation.ok).toBe(false);
		});

		it("should accept optional fields like featureIdea", () => {
			const snapshot = buildSpecSnapshot({
				title: "Test",
				summary: "Test",
				folderPath: "/test",
				documents: [],
				comments: [],
				visuals: [],
				featureIdea: "Add a new checkout flow",
				actionResult: { action: "approved" },
			});

			const validation = validateSnapshot(snapshot);
			expect(validation.ok).toBe(true);
		});
	});
});
