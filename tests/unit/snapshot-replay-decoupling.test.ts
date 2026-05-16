// ABOUTME: End-to-end regression test for the "every plan shows the same content" bug.
// Verifies that snapshot-replay resolution is fully decoupled from the live
// source file: two plans persisted with the same sourcePath produce distinct
// snapshot reads even after the source file has been overwritten.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { buildPlanSnapshot, loadValidatedSnapshot } from "../../extensions/lib/viewer-snapshots.js";

const RAW_DIR = join(".context", "reports", "raw");
const TMP_DIR = join(".context", "tmp-snapshot-replay");

describe("snapshot replay decoupling (regression)", () => {
	beforeEach(() => {
		mkdirSync(RAW_DIR, { recursive: true });
		mkdirSync(TMP_DIR, { recursive: true });
	});

	afterEach(() => {
		try {
			rmSync(RAW_DIR, { recursive: true, force: true });
		} catch {}
		try {
			rmSync(TMP_DIR, { recursive: true, force: true });
		} catch {}
	});

	it("returns the snapshot content even after the source file has been overwritten", () => {
		const sharedPath = join(TMP_DIR, "todo.md");

		// First plan: captured with markdown content "PLAN A"
		const idA = "replay-decouple-plan-A";
		writeFileSync(sharedPath, "# Plan A — original content\n", "utf-8");
		const snapshotA = buildPlanSnapshot({
			title: "Plan A",
			summary: "first plan",
			sourcePath: sharedPath,
			markdownContent: "# Plan A — original content",
			parsedTasks: [],
		});
		writeFileSync(join(RAW_DIR, `${idA}.json`), JSON.stringify(snapshotA), "utf-8");

		// Source file gets overwritten by a newer plan (this is what happens
		// in real use — every plan writes to .context/todo.md).
		writeFileSync(sharedPath, "# Plan B — replaced content\n", "utf-8");

		// Re-opening plan A by id must yield A's content, NOT what's now on disk.
		const loaded = loadValidatedSnapshot(idA);
		expect(loaded).not.toBeNull();
		if (loaded && loaded.mode === "plan") {
			expect(loaded.markdownContent).toContain("Plan A — original content");
			expect(loaded.markdownContent).not.toContain("Plan B");
		}
	});

	it("two snapshots sharing the same source path remain independently retrievable", () => {
		const sharedPath = join(TMP_DIR, "todo.md");
		const idA = "replay-shared-A";
		const idB = "replay-shared-B";
		writeFileSync(join(RAW_DIR, `${idA}.json`), JSON.stringify(buildPlanSnapshot({
			title: "First", summary: "1", sourcePath: sharedPath,
			markdownContent: "# First plan body", parsedTasks: [],
		})), "utf-8");
		writeFileSync(join(RAW_DIR, `${idB}.json`), JSON.stringify(buildPlanSnapshot({
			title: "Second", summary: "2", sourcePath: sharedPath,
			markdownContent: "# Second plan body", parsedTasks: [],
		})), "utf-8");

		const a = loadValidatedSnapshot(idA);
		const b = loadValidatedSnapshot(idB);
		expect(a && a.mode === "plan" ? a.markdownContent : "").toContain("First plan body");
		expect(b && b.mode === "plan" ? b.markdownContent : "").toContain("Second plan body");
	});
});
