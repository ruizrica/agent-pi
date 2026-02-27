// ABOUTME: Tests for subagent session file cleanup logic
// Verifies old session files are removed and recent ones are kept

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdtempSync, rmSync, mkdirSync, readdirSync, utimesSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { cleanOldSessionFiles } from "../lib/subagent-cleanup.ts";

describe("cleanOldSessionFiles", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "subagent-cleanup-"));
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("removes files older than 7 days", () => {
		const oldFile = join(tmpDir, "subagent-1-old.jsonl");
		writeFileSync(oldFile, "test");
		// Set mtime to 8 days ago
		const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
		utimesSync(oldFile, eightDaysAgo, eightDaysAgo);

		cleanOldSessionFiles(tmpDir, 7);

		expect(readdirSync(tmpDir)).toEqual([]);
	});

	it("keeps files newer than 7 days", () => {
		const recentFile = join(tmpDir, "subagent-2-recent.jsonl");
		writeFileSync(recentFile, "test");
		// mtime is now (just created), so it should be kept

		cleanOldSessionFiles(tmpDir, 7);

		expect(readdirSync(tmpDir)).toEqual(["subagent-2-recent.jsonl"]);
	});

	it("removes old files but keeps recent ones", () => {
		const oldFile = join(tmpDir, "subagent-1-old.jsonl");
		const recentFile = join(tmpDir, "subagent-2-recent.jsonl");
		writeFileSync(oldFile, "old");
		writeFileSync(recentFile, "recent");

		const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
		utimesSync(oldFile, eightDaysAgo, eightDaysAgo);

		cleanOldSessionFiles(tmpDir, 7);

		expect(readdirSync(tmpDir)).toEqual(["subagent-2-recent.jsonl"]);
	});

	it("does not throw when directory does not exist", () => {
		expect(() => {
			cleanOldSessionFiles(join(tmpDir, "nonexistent"), 7);
		}).not.toThrow();
	});

	it("does not throw on empty directory", () => {
		expect(() => {
			cleanOldSessionFiles(tmpDir, 7);
		}).not.toThrow();
		expect(readdirSync(tmpDir)).toEqual([]);
	});
});
