// ABOUTME: Tests for gopher-draft-storage.ts — draft file creation, metadata structure, and status updates.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { storeDrafts, type StoredDraft } from "../lib/gopher-draft-storage.ts";
import type { TestFeature } from "../lib/viewers/test-viewer-html.ts";
import { mkdirSync, readFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// ── Test Fixtures ────────────────────────────────────────────────────

let testDir: string;

beforeEach(() => {
	testDir = join(tmpdir(), `test-drafts-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
	if (existsSync(testDir)) {
		try { rmSync(testDir, { recursive: true, force: true }); } catch {}
	}
});

// ── storeDrafts ──────────────────────────────────────────────────────

describe("storeDrafts", () => {
	it("creates .gopher directory structure", () => {
		const features: TestFeature[] = [
			{
				name: "User Auth",
				gherkin: "Feature: User Authentication\n  Scenario: Login",
				playwrightCode: "import { test } from '@playwright/test';",
				filePath: "user-auth.feature",
			},
		];

		storeDrafts(features, testDir);

		expect(existsSync(join(testDir, ".gopher", "gherkin"))).toBe(true);
		expect(existsSync(join(testDir, ".gopher", "playwright"))).toBe(true);
	});

	it("writes gherkin draft files with correct content", () => {
		const gherkinContent = "Feature: Cart\n  Scenario: Add item\n    When I add an item\n    Then the cart has 1 item";
		const features: TestFeature[] = [
			{
				name: "Cart",
				gherkin: gherkinContent,
				playwrightCode: "test('add item', () => {});",
				filePath: "cart.feature",
			},
		];

		const drafts = storeDrafts(features, testDir);
		expect(drafts.length).toBe(1);
		expect(drafts[0].gherkinId).toBeTruthy();
		expect(drafts[0].gherkinPath).toBeTruthy();

		// Read the feature file
		const storedContent = readFileSync(drafts[0].gherkinPath, "utf-8");
		expect(storedContent).toBe(gherkinContent);
	});

	it("writes gherkin metadata with correct structure", () => {
		const features: TestFeature[] = [
			{
				name: "Search",
				gherkin: "Feature: Search",
				playwrightCode: "test('search', () => {});",
				filePath: "search.feature",
			},
		];

		const drafts = storeDrafts(features, testDir);
		const metaPath = drafts[0].gherkinPath.replace(".feature", ".meta.json");
		expect(existsSync(metaPath)).toBe(true);

		const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
		expect(meta.id).toBe(drafts[0].gherkinId);
		expect(meta.status).toBe("draft");
		expect(meta.version).toBe(1);
		expect(meta.workspaceId).toBe(testDir);
		expect(meta.createdAt).toBeTypeOf("number");
		expect(meta.updatedAt).toBeTypeOf("number");
		expect(meta.versions).toEqual([]);
	});

	it("writes playwright draft files with metadata", () => {
		const playwrightContent = "import { test, expect } from '@playwright/test';\ntest('works', () => {});";
		const features: TestFeature[] = [
			{
				name: "Auth",
				gherkin: "Feature: Auth",
				playwrightCode: playwrightContent,
				filePath: "auth.feature",
			},
		];

		const drafts = storeDrafts(features, testDir);
		expect(drafts[0].playwrightId).toBeTruthy();
		expect(drafts[0].playwrightPath).toBeTruthy();

		// Read the spec file
		const storedContent = readFileSync(drafts[0].playwrightPath!, "utf-8");
		expect(storedContent).toBe(playwrightContent);

		// Read playwright metadata
		const metaPath = drafts[0].playwrightPath!.replace(".spec.ts", ".meta.json");
		const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
		expect(meta.id).toBe(drafts[0].playwrightId);
		expect(meta.scenarioIds).toContain(drafts[0].gherkinId);
		expect(meta.status).toBe("draft");
		expect(meta.workspaceId).toBe(testDir);
	});

	it("skips playwright draft for placeholder content", () => {
		const features: TestFeature[] = [
			{
				name: "NoSpec",
				gherkin: "Feature: NoSpec",
				playwrightCode: "// No matching test file was generated",
				filePath: "nospec.feature",
			},
		];

		const drafts = storeDrafts(features, testDir);
		expect(drafts[0].playwrightId).toBeNull();
		expect(drafts[0].playwrightPath).toBeNull();
	});

	it("handles multiple features", () => {
		const features: TestFeature[] = [
			{ name: "Auth", gherkin: "Feature: Auth", playwrightCode: "test('auth');", filePath: "auth.feature" },
			{ name: "Cart", gherkin: "Feature: Cart", playwrightCode: "test('cart');", filePath: "cart.feature" },
			{ name: "Profile", gherkin: "Feature: Profile", playwrightCode: "test('profile');", filePath: "profile.feature" },
		];

		const drafts = storeDrafts(features, testDir);
		expect(drafts.length).toBe(3);

		// All should have unique IDs
		const gherkinIds = drafts.map(d => d.gherkinId);
		expect(new Set(gherkinIds).size).toBe(3);

		// All feature files should exist
		for (const draft of drafts) {
			expect(existsSync(draft.gherkinPath)).toBe(true);
		}
	});

	it("stores feature name in draft result", () => {
		const features: TestFeature[] = [
			{ name: "My Feature", gherkin: "Feature: My Feature", playwrightCode: "test('x');", filePath: "my-feature.feature" },
		];

		const drafts = storeDrafts(features, testDir);
		expect(drafts[0].featureName).toBe("My Feature");
	});
});
