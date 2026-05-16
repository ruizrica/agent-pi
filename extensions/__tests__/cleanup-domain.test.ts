// ABOUTME: Tests pure cleanup domain rules.

import { describe, expect, it } from "vitest";
import { categorizeEntry, formatSize, isProtected, summarizeCleanupResults } from "../lib/cleanup/cleanup-domain.ts";

describe("cleanup domain", () => {
	it("formats byte sizes", () => {
		expect(formatSize(0)).toBe("0 B");
		expect(formatSize(1024)).toBe("1.0 KB");
	});

	it("detects protected paths", () => {
		expect(isProtected("/System/Library")).toBe(true);
		expect(isProtected("/Users/example/project")).toBe(false);
	});

	it("categorizes files and build directories", () => {
		expect(categorizeEntry("foo.tmp", false)).toBe("temp");
		expect(categorizeEntry("app.pyc", false)).toBe("compiled");
		expect(categorizeEntry("archive.tar.gz", false)).toBe("archives");
		expect(categorizeEntry("node_modules", true)).toBe("compiled");
	});

	it("summarizes scan results", () => {
		const result = summarizeCleanupResults({
			temp: [{ path: "/x", name: "x.tmp", size: 512, sizeFormatted: "512 B", modified: "now", isDirectory: false }],
			compiled: [],
			archives: [],
		});
		expect(result.totalFiles).toBe(1);
		expect(result.totalSize).toBe(512);
		expect(result.summary.temp.count).toBe(1);
	});
});
