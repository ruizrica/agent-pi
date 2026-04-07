// ABOUTME: Draft storage for test generation — writes Gherkin and Playwright files as Gopher CLI drafts.
// ABOUTME: Creates .gopher/gherkin/ and .gopher/playwright/ directories with draft files and metadata JSON.

import { writeFileSync, mkdirSync, existsSync, randomUUID } from "fs";
import { join } from "path";
import type { TestFeature } from "./test-viewer-html.ts";

// ── Types ────────────────────────────────────────────────────────────

export interface GherkinDraftMeta {
	id: string;
	surfaceId: string;
	workspaceId: string;
	content: string;
	status: "draft" | "approved" | "stale";
	version: number;
	createdAt: number;
	updatedAt: number;
	versions: string[];
}

export interface PlaywrightDraftMeta {
	id: string;
	scenarioIds: string[];
	workspaceId: string;
	status: "draft" | "reviewed" | "exported" | "stale";
	content: string;
	assumptions: string[];
	createdAt: number;
	exportPath: string | null;
	updatedAt: number;
}

export interface StoredDraft {
	gherkinId: string;
	playwrightId: string | null;
	featureName: string;
	gherkinPath: string;
	playwrightPath: string | null;
}

// ── UUID Helper ──────────────────────────────────────────────────────

function generateUUID(): string {
	// Use crypto.randomUUID if available, otherwise fallback
	if (typeof randomUUID === "function") {
		return randomUUID();
	}
	// Simple fallback UUID v4
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === "x" ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

// ── Draft Storage ────────────────────────────────────────────────────

/**
 * Ensure the .gopher draft directories exist.
 */
function ensureDraftDirs(cwd: string): { gherkinDir: string; playwrightDir: string } {
	const gherkinDir = join(cwd, ".gopher", "gherkin");
	const playwrightDir = join(cwd, ".gopher", "playwright");

	if (!existsSync(gherkinDir)) {
		mkdirSync(gherkinDir, { recursive: true });
	}
	if (!existsSync(playwrightDir)) {
		mkdirSync(playwrightDir, { recursive: true });
	}

	return { gherkinDir, playwrightDir };
}

/**
 * Store test features as Gopher CLI drafts.
 * Creates paired .feature/.meta.json and .spec.ts/.meta.json files.
 */
export function storeDrafts(features: TestFeature[], cwd: string): StoredDraft[] {
	const { gherkinDir, playwrightDir } = ensureDraftDirs(cwd);
	const now = Date.now();
	const drafts: StoredDraft[] = [];

	for (const feature of features) {
		const gherkinId = generateUUID();
		const surfaceId = generateUUID();

		// ── Write Gherkin draft ──────────────────────────────────
		const gherkinPath = join(gherkinDir, `draft-${gherkinId}.feature`);
		const gherkinMetaPath = join(gherkinDir, `draft-${gherkinId}.meta.json`);

		writeFileSync(gherkinPath, feature.gherkin, "utf-8");

		const gherkinMeta: GherkinDraftMeta = {
			id: gherkinId,
			surfaceId,
			workspaceId: cwd,
			content: feature.gherkin,
			status: "draft",
			version: 1,
			createdAt: now,
			updatedAt: now,
			versions: [],
		};
		writeFileSync(gherkinMetaPath, JSON.stringify(gherkinMeta, null, 2), "utf-8");

		// ── Write Playwright draft (if content exists) ──────────
		let playwrightId: string | null = null;
		let playwrightPath: string | null = null;

		const hasPlaywright = feature.playwrightCode &&
			!feature.playwrightCode.includes("No matching test file was generated") &&
			!feature.playwrightCode.includes("Playwright tests pending generation");

		if (hasPlaywright) {
			playwrightId = generateUUID();
			playwrightPath = join(playwrightDir, `draft-${playwrightId}.spec.ts`);
			const playwrightMetaPath = join(playwrightDir, `draft-${playwrightId}.meta.json`);

			writeFileSync(playwrightPath, feature.playwrightCode, "utf-8");

			const playwrightMeta: PlaywrightDraftMeta = {
				id: playwrightId,
				scenarioIds: [gherkinId],
				workspaceId: cwd,
				status: "draft",
				content: feature.playwrightCode,
				assumptions: [],
				createdAt: now,
				exportPath: null,
				updatedAt: now,
			};
			writeFileSync(playwrightMetaPath, JSON.stringify(playwrightMeta, null, 2), "utf-8");
		}

		drafts.push({
			gherkinId,
			playwrightId,
			featureName: feature.name,
			gherkinPath,
			playwrightPath,
		});
	}

	return drafts;
}

/**
 * Update a draft's status (e.g., from "draft" to "approved").
 */
export function updateDraftStatus(
	metaPath: string,
	newStatus: string,
): void {
	try {
		if (!existsSync(metaPath)) return;
		const raw = readFileSync(metaPath, "utf-8");
		const meta = JSON.parse(raw);
		meta.status = newStatus;
		meta.updatedAt = Date.now();
		writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
	} catch {
		// Best-effort status update
	}
}

// Need readFileSync for updateDraftStatus
import { readFileSync } from "fs";
