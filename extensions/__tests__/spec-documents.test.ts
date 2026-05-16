// ABOUTME: Tests for spec document discovery across Kiro and legacy spec layouts.
// ABOUTME: Ensures the spec viewer preserves UI naming while reading the correct document set.

import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverSpecDocuments } from "../lib/spec-documents.ts";

function createTempSpecDir(prefix: string): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

describe("discoverSpecDocuments", () => {
	it("discovers Kiro requirements, design, and tasks documents in order", () => {
		const folderPath = createTempSpecDir("spec-docs-kiro-");
		mkdirSync(join(folderPath, "visuals"));
		writeFileSync(join(folderPath, "requirements.md"), "# Requirements\n", "utf-8");
		writeFileSync(join(folderPath, "design.md"), "# Design\n## Architecture\n```mermaid\ngraph LR\nA-->B\n```\n", "utf-8");
		writeFileSync(join(folderPath, "tasks.md"), "# Tasks\n- [ ] 1. Build it\n", "utf-8");
		writeFileSync(join(folderPath, "visuals", "mock.png"), "png", "utf-8");

		const documents = discoverSpecDocuments(folderPath);

		expect(documents.map((document) => document.key)).toEqual(["requirements", "spec", "tasks", "visuals"]);
		expect(documents[1]?.label).toBe("Spec");
		expect(documents[1]?.filePath).toBe("design.md");
		expect(documents[3]?.filePath).toBe("visuals/");
	});

	it("falls back to the legacy spec and planning layout", () => {
		const folderPath = createTempSpecDir("spec-docs-legacy-");
		mkdirSync(join(folderPath, "planning"), { recursive: true });
		mkdirSync(join(folderPath, "planning", "visuals"), { recursive: true });
		writeFileSync(join(folderPath, "spec.md"), "# Spec\n", "utf-8");
		writeFileSync(join(folderPath, "planning", "requirements.md"), "# Requirements\n", "utf-8");
		writeFileSync(join(folderPath, "planning", "tasks.md"), "# Tasks\n", "utf-8");
		writeFileSync(join(folderPath, "planning", "visuals", "wireframe.html"), "<html></html>", "utf-8");
		writeFileSync(join(folderPath, "planning", "notes.md"), "# Notes\n", "utf-8");

		const documents = discoverSpecDocuments(folderPath);

		expect(documents.map((document) => document.filePath)).toEqual([
			"planning/requirements.md",
			"spec.md",
			"planning/tasks.md",
			"planning/visuals/",
			"planning/notes.md",
		]);
		expect(documents[1]?.label).toBe("Spec");
		expect(documents[4]?.label).toBe("Notes");
	});
});
