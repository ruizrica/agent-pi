// ABOUTME: Parser for test generation chain output — extracts Gherkin and Playwright files from === FILE === delimiters.
// ABOUTME: Pairs .feature and .spec.ts files by base name and converts to TestFeature format for the test viewer.

import type { TestFeature } from "./test-viewer-html.ts";

// ── Types ────────────────────────────────────────────────────────────

interface ParsedFile {
	fileName: string;
	content: string;
	type: "feature" | "spec";
	baseName: string;
}

// ── Parser ───────────────────────────────────────────────────────────

/**
 * Parse chain output containing === FILE: name === delimited sections.
 *
 * Expected format:
 * ```
 * === FILE: module-name.feature ===
 * Feature: ...
 * === END FILE ===
 *
 * === FILE: module-name.spec.ts ===
 * import { test, expect } from '@playwright/test';
 * ...
 * === END FILE ===
 * ```
 *
 * Returns an array of TestFeature objects suitable for show_test_viewer.
 */
export function parseChainOutput(output: string): TestFeature[] {
	const files = extractFiles(output);
	return pairFiles(files);
}

/**
 * Extract individual files from the delimited output.
 */
export function extractFiles(output: string): ParsedFile[] {
	const files: ParsedFile[] = [];

	// Match === FILE: name === ... === END FILE === blocks
	const filePattern = /===\s*FILE:\s*(.+?)\s*===\s*\n([\s\S]*?)===\s*END\s+FILE\s*===/g;
	let match;

	while ((match = filePattern.exec(output)) !== null) {
		const fileName = match[1].trim();
		const content = match[2].trim();

		if (!fileName || !content) continue;

		const isFeature = fileName.endsWith(".feature");
		const isSpec = fileName.endsWith(".spec.ts") || fileName.endsWith(".spec.js") ||
			fileName.endsWith(".test.ts") || fileName.endsWith(".test.js");

		if (!isFeature && !isSpec) continue;

		// Extract base name (strip extension)
		let baseName = fileName;
		if (isFeature) {
			baseName = fileName.replace(/\.feature$/, "");
		} else {
			baseName = fileName.replace(/\.(spec|test)\.(ts|js)$/, "");
		}

		files.push({
			fileName,
			content,
			type: isFeature ? "feature" : "spec",
			baseName,
		});
	}

	return files;
}

/**
 * Pair .feature files with their corresponding .spec.ts files by base name.
 * Returns TestFeature objects for the test viewer.
 */
export function pairFiles(files: ParsedFile[]): TestFeature[] {
	const featureFiles = files.filter(f => f.type === "feature");
	const specFiles = files.filter(f => f.type === "spec");

	// Build a lookup map for spec files by base name
	const specMap = new Map<string, ParsedFile>();
	for (const spec of specFiles) {
		specMap.set(spec.baseName.toLowerCase(), spec);
	}

	const features: TestFeature[] = [];

	for (const feature of featureFiles) {
		// Extract feature name from Gherkin content
		const nameMatch = feature.content.match(/^Feature:\s*(.+)/m);
		const featureName = nameMatch ? nameMatch[1].trim() : feature.baseName;

		// Find matching spec file
		const matchingSpec = specMap.get(feature.baseName.toLowerCase());

		features.push({
			name: featureName,
			gherkin: feature.content,
			playwrightCode: matchingSpec
				? matchingSpec.content
				: `// Playwright tests for: ${featureName}\n// No matching test file was generated\n// This may indicate the reviewer flagged issues that need resolution\n`,
			filePath: feature.fileName,
		});

		// Remove matched spec from the map
		if (matchingSpec) {
			specMap.delete(feature.baseName.toLowerCase());
		}
	}

	// Handle orphaned spec files (specs without matching features)
	for (const [, spec] of specMap) {
		features.push({
			name: spec.baseName,
			gherkin: `Feature: ${spec.baseName}\n  # No Gherkin feature file was generated for this spec\n  # The spec file was generated independently\n`,
			playwrightCode: spec.content,
			filePath: spec.fileName,
		});
	}

	return features;
}

/**
 * Extract reviewer annotations from the chain output.
 * These appear after the final test content in the reviewer's output.
 */
export function extractReviewerAnnotations(output: string): string[] {
	const annotations: string[] = [];

	// Look for "Annotations for Developer:" sections
	const annotationPattern = /###?\s*Annotations?\s+for\s+Developer:?\s*\n([\s\S]*?)(?=\n###|\n===|$)/gi;
	let match;

	while ((match = annotationPattern.exec(output)) !== null) {
		const block = match[1].trim();
		if (block) {
			// Extract individual annotation items
			const items = block.split("\n")
				.map(line => line.replace(/^[-*]\s*/, "").trim())
				.filter(line => line.length > 0);
			annotations.push(...items);
		}
	}

	return annotations;
}

/**
 * Extract quality scores from reviewer output.
 */
export function extractQualityScores(output: string): Map<string, number> {
	const scores = new Map<string, number>();

	// Match patterns like "**Final Score:** 8/10" or "**Quality Score:** 7/10"
	const modulePattern = /###?\s*Module:\s*(.+)/g;
	const scorePattern = /\*\*(?:Final\s+)?(?:Quality\s+)?Score:\*\*\s*(\d+)\s*\/\s*10/gi;

	let currentModule = "";
	const lines = output.split("\n");

	for (const line of lines) {
		const modMatch = /###?\s*Module:\s*(.+)/.exec(line);
		if (modMatch) {
			currentModule = modMatch[1].trim();
			continue;
		}

		const scoreMatch = /\*\*(?:Final\s+)?(?:Quality\s+)?Score:\*\*\s*(\d+)\s*\/\s*10/i.exec(line);
		if (scoreMatch && currentModule) {
			scores.set(currentModule, parseInt(scoreMatch[1], 10));
		}
	}

	return scores;
}
