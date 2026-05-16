// ABOUTME: Regression tests for the payload_id → snapshot resolution path.
// Captures the bug where every /reports re-open rendered the same content
// because the viewer aliases parsed --payload-id but discarded it instead of
// loading the persisted snapshot from .context/reports/raw/<id>.json.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
	buildPlanSnapshot,
	buildSpecSnapshot,
	buildCompletionSnapshot,
	loadValidatedSnapshot,
} from "../../extensions/lib/viewer-snapshots.js";

const RAW_DIR = join(".context", "reports", "raw");

function writeSnapshot(id: string, snapshot: unknown): void {
	mkdirSync(RAW_DIR, { recursive: true });
	writeFileSync(join(RAW_DIR, `${id}.json`), JSON.stringify(snapshot), "utf-8");
}

describe("loadValidatedSnapshot", () => {
	beforeEach(() => {
		mkdirSync(RAW_DIR, { recursive: true });
	});

	afterEach(() => {
		try {
			rmSync(RAW_DIR, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	it("returns the captured plan snapshot when payload_id is valid", () => {
		const id = "plan-aaaa-original";
		const snapshot = buildPlanSnapshot({
			title: "Plan A — original",
			summary: "Investigate scout failure",
			sourcePath: "/tmp/plan-a.md",
			markdownContent: "# Plan A\n\nOriginal scout investigation content.",
			parsedTasks: [],
		});
		writeSnapshot(id, snapshot);

		const loaded = loadValidatedSnapshot(id);

		expect(loaded).not.toBeNull();
		expect(loaded?.mode).toBe("plan");
		if (loaded && loaded.mode === "plan") {
			expect(loaded.markdownContent).toContain("Original scout investigation content");
			expect(loaded.title).toBe("Plan A — original");
		}
	});

	it("loads distinct snapshots for distinct payload_ids — regression against shared-content bug", () => {
		const idA = "plan-A";
		const idB = "plan-B";
		writeSnapshot(idA, buildPlanSnapshot({
			title: "Plan A",
			summary: "First plan",
			sourcePath: "/tmp/todo.md",
			markdownContent: "# Plan A\n\nFirst plan body — investigate auth bug.",
			parsedTasks: [],
		}));
		writeSnapshot(idB, buildPlanSnapshot({
			title: "Plan B",
			summary: "Second plan",
			sourcePath: "/tmp/todo.md",
			markdownContent: "# Plan B\n\nSecond plan body — refactor commander.",
			parsedTasks: [],
		}));

		const loadedA = loadValidatedSnapshot(idA);
		const loadedB = loadValidatedSnapshot(idB);

		expect(loadedA).not.toBeNull();
		expect(loadedB).not.toBeNull();
		if (loadedA && loadedA.mode === "plan" && loadedB && loadedB.mode === "plan") {
			expect(loadedA.markdownContent).not.toBe(loadedB.markdownContent);
			expect(loadedA.markdownContent).toContain("auth bug");
			expect(loadedB.markdownContent).toContain("commander");
		}
	});

	it("returns null when payload_id has no persisted snapshot", () => {
		expect(loadValidatedSnapshot("never-written-id")).toBeNull();
	});

	it("returns null for path-traversal payload_id", () => {
		expect(loadValidatedSnapshot("../secret")).toBeNull();
	});

	it("returns null when the persisted JSON fails schema validation", () => {
		const id = "malformed-plan";
		// Missing required fields (no mode, no markdownContent)
		writeSnapshot(id, { schemaVersion: 1, title: "Broken", capturedAt: new Date().toISOString() });
		expect(loadValidatedSnapshot(id)).toBeNull();
	});

	it("loads valid spec snapshots", () => {
		const id = "spec-001";
		const snapshot = buildSpecSnapshot({
			title: "Auth Spec",
			summary: "Login + signup",
			folderPath: "/tmp/auth",
			documents: [
				{ kind: "requirements", path: "/tmp/auth/requirements.md", markdown: "# Requirements" },
			],
			comments: [],
			visuals: [],
		});
		writeSnapshot(id, snapshot);

		const loaded = loadValidatedSnapshot(id);
		expect(loaded).not.toBeNull();
		if (loaded && "documents" in loaded) {
			expect(loaded.documents).toHaveLength(1);
			expect(loaded.documents[0].kind).toBe("requirements");
		}
	});

	it("loads valid completion snapshots", () => {
		const id = "completion-001";
		const snapshot = buildCompletionSnapshot({
			title: "Refactor done",
			summaryMarkdown: "Removed commander-mcp bridge.",
			baseRef: "HEAD~1",
			gitDiffs: [],
			filesChanged: 0,
		});
		writeSnapshot(id, snapshot);

		const loaded = loadValidatedSnapshot(id);
		expect(loaded).not.toBeNull();
		if (loaded && "gitDiffs" in loaded) {
			expect(loaded.summaryMarkdown).toContain("Removed commander-mcp bridge");
			expect(loaded.baseRef).toBe("HEAD~1");
		}
	});
});
