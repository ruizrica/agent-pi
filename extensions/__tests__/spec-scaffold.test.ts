// ABOUTME: Tests for Kiro spec scaffolding used by the spec viewer.
// ABOUTME: Verifies empty folders are bootstrapped while legacy specs are left untouched.

import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ensureKiroSpecScaffold } from "../lib/spec-scaffold.ts";

function createTempDir(prefix: string): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

describe("ensureKiroSpecScaffold", () => {
	it("creates Kiro spec documents for an empty spec folder", () => {
		const folderPath = join(createTempDir("spec-scaffold-empty-"), "checkout-flow");

		const result = ensureKiroSpecScaffold({
			folderPath,
			title: "Checkout Flow",
			featureIdea: "Add a checkout flow for multi-step purchases.",
		});

		expect(result.createdFolder).toBe(true);
		expect(result.createdVisualsDir).toBe(true);
		expect(result.createdFiles).toEqual([
			"initialization.md",
			"requirements.md",
			"design.md",
			"tasks.md",
		]);
		expect(existsSync(join(folderPath, "requirements.md"))).toBe(true);
		expect(existsSync(join(folderPath, "design.md"))).toBe(true);
		expect(existsSync(join(folderPath, "tasks.md"))).toBe(true);
		expect(readFileSync(join(folderPath, "design.md"), "utf-8")).toContain("```mermaid");
		expect(readFileSync(join(folderPath, "requirements.md"), "utf-8")).toContain("WHEN");
		expect(readFileSync(join(folderPath, "requirements.md"), "utf-8")).toContain("multi-step purchases");
		expect(readFileSync(join(folderPath, "design.md"), "utf-8")).toContain("multi-step purchases");
		expect(readFileSync(join(folderPath, "tasks.md"), "utf-8")).toContain("multi-step purchases");
	});

	it("fills in missing Kiro files without overwriting existing ones", () => {
		const folderPath = createTempDir("spec-scaffold-partial-");
		mkdirSync(join(folderPath, "visuals"), { recursive: true });
		writeFileSync(join(folderPath, "requirements.md"), "# Requirements\nkeep me\n", "utf-8");

		const result = ensureKiroSpecScaffold({
			folderPath,
			title: "Profile Settings",
			featureIdea: "Let users update profile settings and notification preferences.",
		});

		expect(result.createdFiles).toEqual(["initialization.md", "design.md", "tasks.md"]);
		expect(readFileSync(join(folderPath, "requirements.md"), "utf-8")).toContain("keep me");
		expect(readFileSync(join(folderPath, "tasks.md"), "utf-8")).toContain("notification preferences");
	});

	it("does not scaffold over the legacy spec layout", () => {
		const folderPath = createTempDir("spec-scaffold-legacy-");
		mkdirSync(join(folderPath, "planning"), { recursive: true });
		writeFileSync(join(folderPath, "spec.md"), "# Legacy Spec\n", "utf-8");
		writeFileSync(join(folderPath, "planning", "requirements.md"), "# Legacy Requirements\n", "utf-8");

		const result = ensureKiroSpecScaffold({ folderPath, title: "Legacy Spec" });

		expect(result.skippedLegacyLayout).toBe(true);
		expect(result.createdFiles).toEqual([]);
		expect(existsSync(join(folderPath, "design.md"))).toBe(false);
	});
});
