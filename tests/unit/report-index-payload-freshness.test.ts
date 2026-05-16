// ABOUTME: Regression tests for persisted report payload freshness when logical report ids are reused.
// ABOUTME: Ensures missing payloads cannot leave old raw snapshots reopenable as fresh reports.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let originalCwd: string;
let tempCwd: string;

async function loadReportIndexModule() {
	vi.resetModules();
	return import("../../extensions/lib/report-index.js");
}

function commonReportInput() {
	const todoPath = join(process.cwd(), ".context", "todo.md");
	return {
		category: "completion" as const,
		title: "Completion Report",
		summary: "Report summary",
		content: "Report content",
		sourcePath: todoPath,
		viewerPath: todoPath,
		viewerLabel: "Completion Report",
		tags: ["completion", "git", "diff"],
		metadata: { action: "done" },
	};
}

describe("report-index payload freshness", () => {
	beforeEach(() => {
		originalCwd = process.cwd();
		tempCwd = mkdtempSync(join(tmpdir(), "report-index-freshness-"));
		process.chdir(tempCwd);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		try { rmSync(tempCwd, { recursive: true, force: true }); } catch {}
	});

	it("overwrites the raw payload when a reused logical report id receives a fresh payload", async () => {
		const { upsertPersistedReport, readRawPayload, resetReportStorageForTests } = await loadReportIndexModule();
		resetReportStorageForTests();

		const oldPayload = { title: "Old Report", summaryMarkdown: "old payload" };
		const newPayload = { title: "New Report", summaryMarkdown: "new payload" };

		const first = upsertPersistedReport({ ...commonReportInput(), payload: oldPayload });
		const second = upsertPersistedReport({ ...commonReportInput(), payload: newPayload });

		expect(second.id).toBe(first.id);
		expect(readRawPayload(second.id)).toEqual(newPayload);
	});

	it("clears the raw payload when a reused logical report id is updated without a fresh payload", async () => {
		const { upsertPersistedReport, readRawPayload, resetReportStorageForTests } = await loadReportIndexModule();
		resetReportStorageForTests();

		const oldPayload = { title: "Old Stale Report", summaryMarkdown: "old payload still here" };

		const first = upsertPersistedReport({ ...commonReportInput(), payload: oldPayload });
		const second = upsertPersistedReport({ ...commonReportInput(), payload: undefined });

		expect(second.id).toBe(first.id);
		expect(readRawPayload(second.id)).toBeNull();
	});
});
