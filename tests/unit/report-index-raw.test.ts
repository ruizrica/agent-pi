// ABOUTME: Tests for readRawPayload helper from report-index.ts
// Tests reading raw JSON payloads from .context/reports/raw/<id>.json

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { readRawPayload } from "../../extensions/lib/report-index.js";

const RAW_DIR = join(".context", "reports", "raw");

describe("readRawPayload", () => {
	beforeEach(() => {
		try {
			mkdirSync(RAW_DIR, { recursive: true });
		} catch {
			// Directory may already exist
		}
	});

	afterEach(() => {
		try {
			rmSync(RAW_DIR, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	it("returns null for missing id", () => {
		const result = readRawPayload("nonexistent-id");
		expect(result).toBeNull();
	});

	it("returns parsed JSON when raw/<id>.json exists", () => {
		const id = "test-payload-123";
		const payload = {
			schemaVersion: 1,
			capturedAt: new Date().toISOString(),
			mode: "plan" as const,
			title: "Test Plan",
			summary: "Test summary",
			sourcePath: "/test.md",
			markdownContent: "# Test",
			parsedTasks: [],
		};

		writeFileSync(join(RAW_DIR, `${id}.json`), JSON.stringify(payload), "utf-8");

		const result = readRawPayload(id);
		expect(result).toEqual(payload);
	});

	it("rejects ids with path traversal attempts by returning null", () => {
		// Write a decoy file that should NOT be read
		const decoyDir = join(".context", "reports");
		mkdirSync(decoyDir, { recursive: true });
		writeFileSync(join(decoyDir, "secret.json"), '{"secret": true}', "utf-8");

		// Try to read with path traversal
		const result = readRawPayload("../secret");
		expect(result).toBeNull();
	});

	it("returns null for invalid JSON in raw/<id>.json", () => {
		const id = "bad-json-id";
		writeFileSync(join(RAW_DIR, `${id}.json`), "{ invalid json", "utf-8");

		const result = readRawPayload(id);
		expect(result).toBeNull();
	});

	it("sanitizes id removing special characters", () => {
		const id = "test-id!@#$%^&*()";
		const payload = { data: "test" };

		// File will be created with sanitized name (hyphens and alphanumerics preserved)
		writeFileSync(join(RAW_DIR, "test-id.json"), JSON.stringify(payload), "utf-8");

		const result = readRawPayload(id);
		expect(result).toEqual(payload);
	});

	it("returns null for completely invalid id", () => {
		const result = readRawPayload("!@#$%^&*()");
		expect(result).toBeNull();
	});
});
